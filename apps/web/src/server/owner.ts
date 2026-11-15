import {
	type Controller,
	type Definition,
	formatProblems,
	parseDefinition,
	type Withdrawal,
	withdrawalOf,
} from "@gateweave/forms-schema";
import { type ImportReport, importTally } from "@gateweave/forms-tally-import";
import { and, count, eq, ne, notExists, sql } from "drizzle-orm";
import type { CurrentUser } from "./auth";
import { type Database, runBatch } from "./db";
import {
	answer,
	definition as definitions,
	detachedAnswer,
	form as forms,
	response,
	retiredFormId,
	user as users,
} from "./db/schema";
import { examples, type FormState, hashOf, readStored } from "./forms";
import { deleteFormStatements, replaceDefinitionStatements } from "./statements";

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
	/** Who runs the study, as the first page will say it, or nothing when it does not say. */
	controller: Controller | null;
	withdrawal: Withdrawal;
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
		controller: definition.controller ?? null,
		withdrawal: withdrawalOf(definition),
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
	let definition: Definition;
	let report: ImportReport | null = null;
	if (request.kind === "tally") {
		let result: ReturnType<typeof importTally>;
		try {
			result = importTally(request.text, {
				acceptDifferences: request.acceptDifferences === true,
				detachEmail: request.detachEmail === true,
				...(request.id ? { id: request.id } : {}),
			});
		} catch (error) {
			// Page data nested without end runs the importer out of stack. That is the input's
			// fault, and is said as such.
			if (!(error instanceof RangeError)) throw error;
			return { ok: false, problems: ["This is nested too deeply to be a Tally form's page."] };
		}
		if (!result.ok) return { ok: false, problems: result.problems };
		definition = result.definition;
		report = result.report;
	} else {
		let data: unknown;
		try {
			data = JSON.parse(request.text);
		} catch {
			return { ok: false, problems: ["This is not JSON. A definition is a JSON document."] };
		}
		const parsed = parseDefinition(data);
		if (!parsed.ok) return { ok: false, problems: formatProblems(parsed.problems).split("\n") };
		definition = parsed.definition;
	}
	const large = tooLarge(definition);
	if (large) return { ok: false, problems: [large] };
	return { ok: true, definition, summary: summarise(definition), report };
}

/**
 * The most a definition may weigh as stored, in bytes. D1 takes no row above 2 MB, and a
 * definition is one row; half of that leaves room, and is far more than any form's words.
 */
export const MAX_DEFINITION_BYTES = 1_000_000;

function tooLarge(definition: Definition): string | undefined {
	const bytes = new TextEncoder().encode(JSON.stringify(definition)).length;
	return bytes > MAX_DEFINITION_BYTES
		? `This definition is ${Math.ceil(bytes / 1000)} KB, and a form can be at most ${MAX_DEFINITION_BYTES / 1000} KB. Long texts are what weighs: shorten them, or link to them.`
		: undefined;
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
	const large = tooLarge(parsed.definition);
	if (large) throw new Refused(400, "This is not a valid definition.", [large]);
	return parsed.definition;
}

/**
 * Why a form with this definition cannot take answers, or nothing when it can. A person who is
 * asked for answers has to be told who is asking and how to reach them, so a form that does not
 * say stays a draft. The shape lets it be missing, so that a draft and an import can exist.
 */
export function notOpenable(definition: Definition): Refused | undefined {
	return definition.controller
		? undefined
		: new Refused(
				409,
				'This form does not say who runs it, so it cannot take answers yet. Add who runs the study and how to reach them, under Settings or as "controller" in the definition.',
			);
}

/**
 * Brings a form in as a draft that belongs to this person. Its id has to be free: no form has
 * it, and nothing was ever answered under it. Responses can outlive their form (an example
 * that is no longer served, an account that was removed), and whoever then took the id would
 * be shown them. There is no exception: answers given to an example before anyone owned it
 * were given to nobody, and stay nobody's.
 */
export async function createForm(
	db: Database,
	user: CurrentUser,
	input: unknown,
	state: FormState = "draft",
): Promise<{ id: string }> {
	const definition = checked(input);
	const { id } = definition;
	if (state === "open") {
		const refusal = notOpenable(definition);
		if (refusal) throw refusal;
	}
	// The same words whatever holds it: this must not say whose it is, or that answers exist.
	const taken = new Refused(
		409,
		`The id "${id}" is taken. A form's id is its address, so each needs its own: change "id" in the definition.`,
	);
	const [held, answered, kept, retired] = await db.batch([
		db.select({ id: forms.id }).from(forms).where(eq(forms.id, id)).limit(1),
		db.select({ id: response.id }).from(response).where(eq(response.formId, id)).limit(1),
		db
			.select({ id: detachedAnswer.id })
			.from(detachedAnswer)
			.where(eq(detachedAnswer.formId, id))
			.limit(1),
		// The id of a form that was deleted stays with the account that had it: a link to the
		// old form must not open another person's. The account may be gone; the id is not free.
		db
			.select({ id: retiredFormId.formId })
			.from(retiredFormId)
			.where(and(eq(retiredFormId.formId, id), ne(retiredFormId.ownerId, user.id)))
			.limit(1),
	]);
	if (held.length > 0 || answered.length > 0 || kept.length > 0 || retired.length > 0) throw taken;
	const hash = await hashOf(definition);
	const now = Date.now();
	try {
		await db.batch([
			db
				.insert(definitions)
				.values({ hash, formId: id, json: JSON.stringify(definition) })
				.onConflictDoNothing(),
			db.insert(forms).values({
				id,
				ownerId: user.id,
				title: definition.title,
				state,
				definitionHash: hash,
				createdAt: now,
				updatedAt: now,
			}),
		]);
	} catch (error) {
		// Two requests for one id at once both find it free. The table's key lets one in, and
		// the other is told what it would have been told a moment later.
		if (await db.select({ id: forms.id }).from(forms).where(eq(forms.id, id)).get()) throw taken;
		throw error;
	}
	return { id: definition.id };
}

/**
 * Adds the made-up example forms to this person's account, open, where the deployment serves
 * examples at all. One that is already someone's, or that was answered while it was nobody's,
 * is left alone, as any form with that id would be.
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
	// An open form's first page must go on saying who runs it.
	const refusal = row.state === "open" ? notOpenable(definition) : undefined;
	if (refusal) throw refusal;
	const hash = await hashOf(definition);
	// Asked again by the statements: the form may have been opened or deleted since its row was
	// read. A replace that loses writes nothing, its definition's row included.
	const changed = await runBatch(
		db.$client,
		replaceDefinitionStatements({
			formId: row.id,
			ownerId: row.ownerId,
			hash,
			json: JSON.stringify(definition),
			title: definition.title,
			hasController: definition.controller !== undefined,
			now: Date.now(),
		}),
	);
	if (!changed.at(-1)) throw notOpenable(definition) ?? new NotFound();
}

/**
 * Gives a form the line that says who runs it, by making a definition that differs from the
 * current one in nothing else. There is no builder, and a form brought in from elsewhere has no
 * such line, so without this it could never be opened.
 */
export async function setController(
	db: Database,
	row: FormRow,
	controller: Controller,
): Promise<void> {
	const current = await definitionOfVersion(db, row, row.definitionHash);
	if (!current) throw new Error("A form's definition is missing");
	await replaceDefinition(db, row, { ...current, controller });
}

/** Opens or closes a form. Opening is refused while its definition does not say who runs it. */
export async function setState(db: Database, row: FormRow, state: FormState): Promise<void> {
	if (state === "open") {
		const current = await definitionOfVersion(db, row, row.definitionHash);
		if (!current) throw new Error("A form's definition is missing");
		const refusal = notOpenable(current);
		if (refusal) throw refusal;
	}
	const changed = await db
		.update(forms)
		.set({ state, updatedAt: Date.now() })
		.where(
			and(
				eq(forms.id, row.id),
				// Opened under the definition that was just checked, not one that replaced it since.
				state === "open" ? eq(forms.definitionHash, row.definitionHash) : undefined,
			),
		);
	if (changed.meta.changes === 0) {
		throw new Refused(409, "This form was changed in the meantime. Load the page again.");
	}
}

/** One version of a form's definition, with how many responses began under it. */
export interface Version {
	hash: string;
	current: boolean;
	started: number;
	completed: number;
	/**
	 * How many responses to this version were taken back by the people who gave them, before
	 * or after finishing. They are in neither of the other two numbers.
	 */
	withdrawn: number;
	title: string;
}

/** Every definition a form has had, the current one first, each with its responses' count. */
export async function versions(db: Database, row: FormRow): Promise<Version[]> {
	const rows = await db
		.select({
			hash: definitions.hash,
			json: definitions.json,
			withdrawn: definitions.withdrawn,
			started: count(response.id),
			completed: sql<number>`count(${response.completedAt})`,
		})
		.from(definitions)
		.leftJoin(response, eq(response.definitionHash, definitions.hash))
		.where(eq(definitions.formId, row.id))
		.groupBy(definitions.hash)
		.all();
	return rows
		.map(({ hash, json, started, completed, withdrawn }) => ({
			hash,
			current: hash === row.definitionHash,
			started,
			completed,
			withdrawn,
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

/**
 * How much a form holds, for the page that asks before deleting it.
 *
 * The number of kept-apart answers is given only for a closed form. While a form takes
 * answers its owner sees each response arrive, and a number that went up just after one was
 * completed would say that this person left something. `null` is "not said", not "none".
 */
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
		detached: row.state === "closed" ? (detached[0]?.n ?? 0) : null,
	};
}

/**
 * Deletes every response of a form, their answers, and the answers it kept apart. The form and
 * its definitions stay.
 */
export async function deleteAllResponses(db: Database, row: FormRow): Promise<void> {
	await allOrNothing(() =>
		db.batch([
			db.delete(response).where(eq(response.formId, row.id)),
			db.delete(detachedAnswer).where(eq(detachedAnswer.formId, row.id)),
		]),
	);
}

/**
 * Runs a batch that deletes a great deal, and says so in words when the database would not do
 * it. A batch is one transaction: when it fails, nothing of it happened. The usual reason is
 * size: a form with very many answers can be more than the database deletes in one step, or
 * more rows than the account may write in a day. The person has to know that nothing was
 * deleted, and what they can do, which a bare "something went wrong" does not tell them.
 */
async function allOrNothing(batch: () => Promise<unknown>): Promise<void> {
	try {
		await batch();
	} catch (error) {
		console.error(`owner: delete failed, ${error instanceof Error ? error.name : "failure"}`);
		throw new Refused(
			503,
			"The database could not delete this in one step, so nothing was deleted. A form with very many answers can be too much for one step: delete responses one at a time on the Responses page to make it smaller, then try again, or ask whoever runs this server.",
		);
	}
}

/**
 * Deletes a form and everything under its id: every response with its answers, what it kept
 * apart, the form's row and every definition it has had, the counts of withdrawn responses
 * with them. One batch, so that it is all there or all gone. What is left is the id itself,
 * retired to the account that had it (`retired_form_id`): old links to the form are still out
 * there, and must never open a form of someone else's.
 */
export async function deleteForm(db: Database, row: FormRow): Promise<void> {
	await allOrNothing(() =>
		runBatch(db.$client, deleteFormStatements({ id: row.id, ownerId: row.ownerId })),
	);
}

/**
 * Deletes an account, with its sessions and its password, when it owns no form. Whether it
 * does is asked by the statement that deletes: a form brought in a moment ago counts.
 *
 * It is refused while there is a form because the table would take the forms with the account
 * and leave their responses behind, under ids nobody could then reach or delete. Deleting a
 * form is a decision about a study's data, and is made form by form, with the numbers in view.
 */
export async function deleteAccount(db: Database, user: CurrentUser): Promise<void> {
	const removed = await db
		.delete(users)
		.where(
			and(
				eq(users.id, user.id),
				notExists(db.select({ id: forms.id }).from(forms).where(eq(forms.ownerId, user.id))),
			),
		);
	if (removed.meta.changes === 0) {
		throw new Refused(
			409,
			"This account still has forms. Delete each form first, under its Settings: that removes its responses too, and says how many.",
		);
	}
}
