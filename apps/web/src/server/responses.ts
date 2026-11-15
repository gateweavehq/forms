import {
	ANSWERS_VERSION,
	type AnswerValue,
	answerValueSchema,
	type Definition,
	definitionSchema,
	detachedQuestions,
	detachedQuestionsShown,
	emptyAnswers,
	isAnswered,
	isChoices,
	placesOf,
	type Question,
	type ResponseAnswers,
	unansweredRequired,
	withAnswer,
} from "@gateweave/forms-schema";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db";
import { answer, definition as definitions, detachedAnswer, response } from "./db/schema";
import type { Form } from "./forms";
import { randomToken, sealSecret, secretMatches } from "./secret";

export type Device = "phone" | "tablet" | "desk";

export type ResponseRow = typeof response.$inferSelect;

/** Why something a respondent sent was not stored. `status` is the HTTP status it answers with. */
export class Refusal extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
	}
}

/** One answer as it arrives: the question, the item for a block's question, and what was given. */
export interface IncomingAnswer {
	question: string;
	item?: string | undefined;
	/** `null` when the question was shown and left without an answer. */
	value: unknown;
	/** Milliseconds the question was on screen, in a visible tab, this time. */
	activeMs: number;
}

/**
 * Starts a response and makes its secret. The secret is returned once and never stored: the
 * database keeps a seal that proves it.
 */
export async function createResponse(
	db: Database,
	form: Form,
	device: Device,
): Promise<{ id: string; secret: string }> {
	const id = randomToken(12);
	const secret = randomToken(32);
	const now = Date.now();
	const formId = form.definition.id;
	await db.batch([
		// Kept once per content. A form that has not changed adds nothing here.
		db
			.insert(definitions)
			.values({ hash: form.hash, formId, json: JSON.stringify(form.definition) })
			.onConflictDoNothing(),
		db.insert(response).values({
			id,
			formId,
			definitionHash: form.hash,
			answersVersion: ANSWERS_VERSION,
			secretSeal: await sealSecret(id, secret),
			device,
			createdAt: now,
			updatedAt: now,
		}),
	]);
	return { id, secret };
}

/** Definitions already read, by hash. A hash names one content for good, so this never goes stale. */
const stored = new Map<string, Definition>();

/**
 * The definition a response was started under. Its answers are checked against this one, not
 * against the form as it is today: an option the person chose must not become invalid because
 * the form's author renamed it since.
 */
export async function definitionOf(db: Database, row: ResponseRow): Promise<Definition> {
	const known = stored.get(row.definitionHash);
	if (known) return known;
	const found = await db
		.select({ json: definitions.json })
		.from(definitions)
		.where(eq(definitions.hash, row.definitionHash))
		.get();
	if (!found) throw new Error("A response's definition is missing");
	const read = definitionSchema.parse(JSON.parse(found.json));
	stored.set(row.definitionHash, read);
	return read;
}

/**
 * The response with this id, when the secret is its own. A wrong secret and an unknown id give
 * the same nothing, so an id alone tells nobody whether a response exists.
 */
export async function findResponse(
	db: Database,
	id: string,
	secret: string,
): Promise<ResponseRow | undefined> {
	const row = await db.select().from(response).where(eq(response.id, id)).get();
	if (!row) return undefined;
	return (await secretMatches(id, secret, row.secretSeal)) ? row : undefined;
}

/** A response's answers in the shape the definition's package gives them. */
export async function readAnswers(db: Database, responseId: string): Promise<ResponseAnswers> {
	const rows = await db.select().from(answer).where(eq(answer.responseId, responseId)).all();
	let answers = emptyAnswers();
	for (const row of rows) {
		answers = withAnswer(answers, row.questionId, row.itemId === "" ? undefined : row.itemId, {
			value: row.value === null ? null : (JSON.parse(row.value) as AnswerValue),
			activeMs: row.activeMs,
			changes: row.changes,
		});
	}
	return answers;
}

/** JSON with every object's keys in order, so that the same value is always the same text. */
function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value)
			.filter(([, inner]) => inner !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableJson(inner)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

/**
 * A checked value as the text that is stored. Options chosen in another order are the same
 * answer, so they are put in the question's order first: a change is counted by comparing texts.
 */
function storedValue(question: Question, value: AnswerValue): string {
	if (question.type === "multiple_choice" && isChoices(value)) {
		const order = question.options.map((option) => option.id);
		const options = [...value.options].sort((a, b) => order.indexOf(a) - order.indexOf(b));
		return stableJson({ ...value, options });
	}
	return stableJson(value);
}

/** Checks an arriving answer against the form, and returns it as it will be stored. */
function checkAnswer(
	definition: Definition,
	incoming: IncomingAnswer,
): { questionId: string; itemId: string; value: string | null } {
	const places = placesOf(definition);
	const place = places.questions.get(incoming.question);
	if (!place) throw new Refusal(400, "This form has no such question.");
	const { question } = place;
	if (question.detached) {
		// Storing it here would link it to the response, which is what detaching promises not to do.
		throw new Refusal(400, "This question's answer is stored apart, not with the response.");
	}
	const inBlock = place.part !== undefined;
	if (inBlock !== (incoming.item !== undefined)) {
		throw new Refusal(
			400,
			inBlock
				? "This question is asked for each item, so the answer has to name its item."
				: "This question is not asked for each item.",
		);
	}
	if (incoming.item !== undefined) {
		const item = places.items.get(incoming.item);
		if (item?.section.id !== place.section.id) {
			throw new Refusal(400, "This question is not asked about that item.");
		}
	}
	const itemId = incoming.item ?? "";
	if (incoming.value === null) return { questionId: question.id, itemId, value: null };
	const parsed = answerValueSchema(question).safeParse(incoming.value);
	if (!parsed.success) throw new Refusal(400, "This is not an answer the question can take.");
	return { questionId: question.id, itemId, value: storedValue(question, parsed.data) };
}

/** A step's key, as the flow writes them. Stored as given: only the browser reads it back. */
const POSITION = /^[sqif]:[a-z0-9_:-]{1,140}$/;

/**
 * Stores an answer as it is given, and where the person is now. The time adds up over visits,
 * and a change is counted when an answer that was there is replaced by a different one. The
 * server counts: what a browser says about its own changes is not evidence.
 */
export async function saveProgress(
	db: Database,
	definition: Definition,
	row: ResponseRow,
	progress: { answer?: IncomingAnswer | undefined; position?: string | undefined },
): Promise<void> {
	if (row.completedAt !== null) throw new Refusal(409, "This response is complete.");
	if (progress.position !== undefined && !POSITION.test(progress.position)) {
		throw new Refusal(400, "This is not a place in a form.");
	}
	const now = Date.now();
	const touch = db
		.update(response)
		.set({
			updatedAt: now,
			...(progress.position === undefined ? {} : { position: progress.position }),
		})
		.where(eq(response.id, row.id));
	if (!progress.answer) {
		await touch;
		return;
	}
	const checked = checkAnswer(definition, progress.answer);
	const upsert = db
		.insert(answer)
		.values({
			responseId: row.id,
			...checked,
			activeMs: progress.answer.activeMs,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [answer.responseId, answer.questionId, answer.itemId],
			// SQLite evaluates every right-hand side against the row as it was.
			set: {
				changes: sql`${answer.changes} + (CASE WHEN ${answer.value} IS NOT NULL AND ${answer.value} IS NOT excluded.value THEN 1 ELSE 0 END)`,
				value: sql`excluded.value`,
				activeMs: sql`${answer.activeMs} + excluded.active_ms`,
				updatedAt: sql`excluded.updated_at`,
			},
		});
	// Together or not at all: an answer without its place would resume one step behind.
	await db.batch([upsert, touch]);
}

/**
 * Marks a response complete. It is refused while a required question that is shown has no
 * answer, and names those steps. Completing twice changes nothing.
 */
export async function completeResponse(
	db: Database,
	definition: Definition,
	row: ResponseRow,
): Promise<void> {
	if (row.completedAt !== null) return;
	const missing = unansweredRequired(definition, await readAnswers(db, row.id));
	if (missing.length > 0) {
		throw new Refusal(422, "Some questions that need an answer have none.", {
			missing: missing.map((step) => step.key),
		});
	}
	const now = Date.now();
	await db
		.update(response)
		.set({ completedAt: now, updatedAt: now })
		.where(and(eq(response.id, row.id)));
}

/** A random key for a row whose order of arrival must not be stored. Fits a JavaScript number. */
function randomRowId(): number {
	const [high = 0, low = 0] = crypto.getRandomValues(new Uint32Array(2));
	return (high & 0x1fffff) * 2 ** 32 + low;
}

/**
 * Stores a form's detached answers apart: with the form's id, and nothing that says which
 * response they came with or when.
 */
export async function saveDetached(
	db: Database,
	form: Form,
	incoming: Record<string, unknown>,
): Promise<void> {
	const known = new Map(
		detachedQuestions(form.definition).map((question) => [question.id, question]),
	);
	const values: Record<string, AnswerValue> = {};
	for (const [id, value] of Object.entries(incoming)) {
		const question = known.get(id);
		if (!question) throw new Refusal(400, "This form keeps no such answer apart.");
		if (value === null) continue;
		const parsed = answerValueSchema(question).safeParse(value);
		if (!parsed.success) throw new Refusal(400, "This is not an answer the question can take.");
		values[id] = parsed.data;
	}
	// Only what the form would have shown is kept: an answer to a question whose rule does not
	// hold was not asked.
	const shown = detachedQuestionsShown(form.definition, values);
	const kept: Record<string, AnswerValue> = {};
	for (const question of shown) {
		const value = values[question.id];
		if (isAnswered(value)) kept[question.id] = value;
	}
	if (Object.keys(kept).length === 0) throw new Refusal(400, "There is nothing to store.");
	await db.insert(detachedAnswer).values({
		id: randomRowId(),
		formId: form.definition.id,
		answers: stableJson(kept),
	});
}
