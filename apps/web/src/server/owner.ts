import { type Definition, formatProblems, parseDefinition } from "@gateweave/forms-schema";
import { type ImportReport, importTally } from "@gateweave/forms-tally-import";
import { and, count, eq, sql } from "drizzle-orm";
import type { CurrentUser } from "./auth";
import type { Database } from "./db";
import {
	answer,
	definition as definitions,
	detachedAnswer,
	form as forms,
	response,
} from "./db/schema";
import { examples, type FormState, hashOf, readStored } from "./forms";

/**
 * Thrown for a form that is missing, belongs to someone else, or is asked for by nobody signed
 * in. The three are one answer on purpose: "not yours" would say that the form exists.
 */
export class NotFound extends Error {}

/** Thrown for something the owner asked that cannot be done, with words for them. */
export class Refused extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly problems: string[] = [],
	) {
		super(message);
	}
}

export type FormRow = typeof forms.$inferSelect;

/**
 * The form with this id, if it belongs to this person. Every page and every address of the
 * owner's side starts here, so that there is one place where ownership is decided.
 */
export async function ownedForm(
	db: Database,
	user: CurrentUser | null,
	formId: string,
): Promise<FormRow> {
	if (!user) throw new NotFound();
	const row = await db
		.select()
		.from(forms)
		.where(and(eq(forms.id, formId), eq(forms.ownerId, user.id)))
		.get();
	if (!row) throw new NotFound();
	return row;
}

/** A person's forms, newest first, each with how many responses it has and how many finished. */
export async function listForms(db: Database, user: CurrentUser) {
	const rows = await db
		.select({
			id: forms.id,
			title: forms.title,
			state: forms.state,
			createdAt: forms.createdAt,
			started: count(response.id),
			completed: sql<number>`count(${response.completedAt})`,
		})
		.from(forms)
		.leftJoin(response, eq(response.formId, forms.id))
		.where(eq(forms.ownerId, user.id))
		.groupBy(forms.id)
		.orderBy(sql`${forms.createdAt} desc`)
		.all();
	return rows;
}

/** A definition in short, for the page that shows what is about to be brought in. */
export interface DefinitionSummary {
	id: string;
	title: string;
	hasConsent: boolean;
	sections: Array<{
		title: string;
		type: "questions" | "repeat";
		questions: number;
		groups: Array<{ title: string; items: number }>;
	}>;
}

export function summarise(definition: Definition): DefinitionSummary {
	return {
		id: definition.id,
		title: definition.title,
		hasConsent: definition.consent !== undefined,
		sections: definition.sections.map((section) =>
			section.type === "questions"
				? {
						title: section.title,
						type: section.type,
						questions: section.questions.length,
						groups: [],
					}
				: {
						title: section.title,
						type: section.type,
						questions: section.block.status.length + section.block.followUps.length,
						groups: section.groups.map((group) => ({
							title: group.title,
							items: group.items.length,
						})),
					},
		),
	};
}

export type Preview =
	| { ok: true; definition: Definition; summary: DefinitionSummary; report: ImportReport | null }
	| { ok: false; problems: string[] };

export interface PreviewRequest {
	/** What the text is: a definition, or the JSON of a Tally form's page. */
	kind: "definition" | "tally";
	text: string;
	/** For a Tally page: fold copies that differ by taking what most of them have. */
	acceptDifferences?: boolean | undefined;
	/** For a Tally page: store email questions apart. */
	detachEmail?: boolean | undefined;
	/** For a Tally page: the form's id, when the one made from its title will not do. */
	id?: string | undefined;
}

/**
 * Reads what someone pasted or uploaded, and says what it would become: a valid definition
 * with its outline (and the importer's report, for a Tally page), or every problem with it.
 * Nothing is stored.
 */
export function preview(request: PreviewRequest): Preview {
	if (request.kind === "tally") {
		const result = importTally(request.text, {
			acceptDifferences: request.acceptDifferences === true,
			detachEmail: request.detachEmail === true,
			...(request.id ? { id: request.id } : {}),
		});
		if (!result.ok) return { ok: false, problems: result.problems };
		const { definition, report } = result;
		return { ok: true, definition, summary: summarise(definition), report };
	}
	let data: unknown;
	try {
		data = JSON.parse(request.text);
	} catch {
		return { ok: false, problems: ["This is not JSON. A definition is a JSON document."] };
	}
	const parsed = parseDefinition(data);
	if (!parsed.ok) return { ok: false, problems: formatProblems(parsed.problems).split("\n") };
	return {
		ok: true,
		definition: parsed.definition,
		summary: summarise(parsed.definition),
		report: null,
	};
}

/** Checks a definition that arrives to be stored: the page sends back what `preview` gave it. */
function checked(input: unknown): Definition {
	const parsed = parseDefinition(input);
	if (!parsed.ok) {
		throw new Refused(
			400,
			"This is not a valid definition.",
			formatProblems(parsed.problems).split("\n"),
		);
	}
	return parsed.definition;
}

/** Brings a form in as a draft that belongs to this person. Its id has to be free. */
export async function createForm(
	db: Database,
	user: CurrentUser,
	input: unknown,
	state: FormState = "draft",
): Promise<{ id: string }> {
	const definition = checked(input);
	const taken = await db
		.select({ id: forms.id })
		.from(forms)
		.where(eq(forms.id, definition.id))
		.get();
	if (taken) {
		// The same words whoever has it: this must not say whether it is the asker's own.
		throw new Refused(
			409,
			`The id "${definition.id}" is taken. A form's id is its address, so each needs its own: change "id" in the definition.`,
		);
	}
	const hash = await hashOf(definition);
	const now = Date.now();
	await db.batch([
		db
			.insert(definitions)
			.values({ hash, formId: definition.id, json: JSON.stringify(definition) })
			.onConflictDoNothing(),
		db.insert(forms).values({
			id: definition.id,
			ownerId: user.id,
			title: definition.title,
			state,
			definitionHash: hash,
			createdAt: now,
			updatedAt: now,
		}),
	]);
	return { id: definition.id };
}

/**
 * Adds the made-up example forms to this person's account, open, where the deployment serves
 * examples at all. One that is already someone's is left alone.
 */
export async function addExamples(db: Database, user: CurrentUser): Promise<number> {
	let added = 0;
	for (const example of examples()) {
		try {
			await createForm(db, user, example, "open");
			added++;
		} catch (error) {
			if (!(error instanceof Refused)) throw error;
		}
	}
	return added;
}

/**
 * Gives a form a new definition. Responses already begun keep the one they started under; new
 * ones start under this. The id cannot change: it is the form's address.
 */
export async function replaceDefinition(db: Database, row: FormRow, input: unknown): Promise<void> {
	const definition = checked(input);
	if (definition.id !== row.id) {
		throw new Refused(
			400,
			`This definition's id is "${definition.id}", and this form's is "${row.id}". A form keeps its id: change "id" in the definition, or bring it in as a new form.`,
		);
	}
	const hash = await hashOf(definition);
	await db.batch([
		db
			.insert(definitions)
			.values({ hash, formId: row.id, json: JSON.stringify(definition) })
			.onConflictDoNothing(),
		db
			.update(forms)
			.set({ definitionHash: hash, title: definition.title, updatedAt: Date.now() })
			.where(eq(forms.id, row.id)),
	]);
}

export async function setState(db: Database, row: FormRow, state: FormState): Promise<void> {
	await db.update(forms).set({ state, updatedAt: Date.now() }).where(eq(forms.id, row.id));
}

/** One version of a form's definition, with how many responses began under it. */
export interface Version {
	hash: string;
	current: boolean;
	started: number;
	completed: number;
	title: string;
}

/** Every definition a form has had, the current one first, each with its responses' count. */
export async function versions(db: Database, row: FormRow): Promise<Version[]> {
	const rows = await db
		.select({
			hash: definitions.hash,
			json: definitions.json,
			started: count(response.id),
			completed: sql<number>`count(${response.completedAt})`,
		})
		.from(definitions)
		.leftJoin(response, eq(response.definitionHash, definitions.hash))
		.where(eq(definitions.formId, row.id))
		.groupBy(definitions.hash)
		.all();
	return rows
		.map(({ hash, json, started, completed }) => ({
			hash,
			current: hash === row.definitionHash,
			started,
			completed,
			title: readStored(hash, json).title,
		}))
		.sort((a, b) => Number(b.current) - Number(a.current) || b.started - a.started);
}

/** The definition of one version of a form, or nothing when the form never had it. */
export async function definitionOfVersion(
	db: Database,
	row: FormRow,
	hash: string,
): Promise<Definition | undefined> {
	const found = await db
		.select({ json: definitions.json })
		.from(definitions)
		.where(and(eq(definitions.hash, hash), eq(definitions.formId, row.id)))
		.get();
	return found ? readStored(hash, found.json) : undefined;
}

/** Deletes one response of this form with its answers. Says whether there was one. */
export async function deleteResponse(
	db: Database,
	row: FormRow,
	responseId: string,
): Promise<boolean> {
	// The answers go with it: `answer` refers to `response` with ON DELETE CASCADE.
	const removed = await db
		.delete(response)
		.where(and(eq(response.id, responseId), eq(response.formId, row.id)));
	return removed.meta.changes > 0;
}

/** How much a form holds, for the page that asks before deleting it. */
export async function holdings(db: Database, row: FormRow) {
	const [responses, answers, detached] = await db.batch([
		db.select({ n: count() }).from(response).where(eq(response.formId, row.id)),
		db
			.select({ n: count() })
			.from(answer)
			.innerJoin(response, eq(response.id, answer.responseId))
			.where(eq(response.formId, row.id)),
		db.select({ n: count() }).from(detachedAnswer).where(eq(detachedAnswer.formId, row.id)),
	]);
	return {
		responses: responses[0]?.n ?? 0,
		answers: answers[0]?.n ?? 0,
		detached: detached[0]?.n ?? 0,
	};
}

/**
 * Deletes every response of a form, their answers, and the answers it kept apart. The form and
 * its definitions stay.
 */
export async function deleteAllResponses(db: Database, row: FormRow): Promise<void> {
	await db.batch([
		db.delete(response).where(eq(response.formId, row.id)),
		db.delete(detachedAnswer).where(eq(detachedAnswer.formId, row.id)),
	]);
}
