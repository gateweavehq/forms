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
	reachedAnswers,
	referencedQuestions,
	unansweredRequired,
	withAnswer,
	withdrawalOf,
} from "@gateweave/forms-schema";
import { and, eq, isNull } from "drizzle-orm";
import { type Database, runBatch } from "./db";
import { answer, definition as definitions, detachedAnswer, response } from "./db/schema";
import type { Form } from "./forms";
import { randomToken, sealSecret, secretMatches } from "./secret";
import {
	keepApartStatement,
	type Statement,
	startStatements,
	withdrawStatements,
} from "./statements";

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
	const json = JSON.stringify(form.definition);
	const seal = await sealSecret(id, secret);
	if (form.ownerId === null) {
		// An example served from its file: there is no row whose state could have changed.
		await db.batch([
			// Kept once per content. A form that has not changed adds nothing here.
			db.insert(definitions).values({ hash: form.hash, formId, json }).onConflictDoNothing(),
			db.insert(response).values({
				id,
				formId,
				definitionHash: form.hash,
				answersVersion: ANSWERS_VERSION,
				secretSeal: seal,
				device,
				createdAt: now,
				updatedAt: now,
			}),
		]);
		return { id, secret };
	}
	// "Still open" is asked again by the statements themselves. The form was read a moment ago,
	// and its owner can close or delete it in between: a response written after its form was
	// deleted would lie under an id nobody owns, where no one could find or delete it.
	const changed = await runBatch(
		db,
		startStatements({
			id,
			formId,
			hash: form.hash,
			json,
			answersVersion: ANSWERS_VERSION,
			seal,
			device,
			now,
		}),
	);
	if (!changed.at(-1)) throw new Refusal(404, "There is no such form.");
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

/**
 * A save's mark, exactly as the page makes it: 16 random bytes in hex. It is the same when the
 * page sends the save again because no reply came, and another for the next save.
 */
const SAVE_MARK = /^[0-9a-f]{32}$/;

/**
 * The mark a request came with, or none. Anything that is not a mark is none, and is never a
 * reason to refuse: a save without a mark is stored as saves always were, so the worst a bad
 * mark can do is let a time count twice. Refusing would lose the answer.
 */
export function saveMarkOf(given: string | null | undefined): string | undefined {
	return given != null && SAVE_MARK.test(given) ? given : undefined;
}

/** A step's key, as the flow writes them. Stored as given: only the browser reads it back. */
const POSITION = /^[sqif]:[a-z0-9_:-]{1,140}$/;

/**
 * Stores an answer as it is given, and where the person is now. The time adds up over visits,
 * and a change is counted when an answer that was there is replaced by a different one. The
 * server counts: what a browser says about its own changes is not evidence.
 *
 * A save can arrive twice: the database commits it, the reply is lost, and the page, which
 * cannot tell that from a save that failed, sends it again. So the page marks each save
 * (`save`), and the answer's row keeps the mark of the save that last wrote it. A save whose
 * mark and value the row already has was applied: it writes nothing, deletes nothing, and is
 * answered as it was the first time. Anything else is a save like any other: one without a
 * mark, from a page older than the marks, and one whose mark the row has with another value,
 * which no page of ours sends and which must not be answered "saved" without being stored.
 */
export async function saveProgress(
	db: Database,
	definition: Definition,
	row: ResponseRow,
	progress: {
		answer?: IncomingAnswer | undefined;
		position?: string | undefined;
		save?: string | undefined;
	},
): Promise<void> {
	if (row.completedAt !== null) throw new Refusal(409, "This response is complete.");
	if (progress.position !== undefined && !POSITION.test(progress.position)) {
		throw new Refusal(400, "This is not a place in a form.");
	}
	const now = Date.now();
	// "Still open" is asked again inside each statement. The check above read the row a moment
	// ago, and a request that completes the response can arrive between the two: a completed
	// response must not change, whichever of them the database runs first.
	const touch = db
		.update(response)
		.set({
			updatedAt: now,
			...(progress.position === undefined ? {} : { position: progress.position }),
		})
		.where(and(eq(response.id, row.id), isNull(response.completedAt)));
	if (!progress.answer) {
		const touched = await touch;
		if (touched.meta.changes === 0) throw new Refusal(409, "This response is complete.");
		return;
	}
	const checked = checkAnswer(definition, progress.answer);
	// An answer that other questions' rules look at can close them. What was answered under
	// them is taken back with it, here and now: a person who changes "stopped" to "never" has
	// withdrawn why they stopped, whether or not they go on to finish. Kept until completion,
	// it would sit in the results of every response that was not finished.
	const stale = ruledBy(definition).has(checked.questionId)
		? reachedAnswers(
				definition,
				withAnswer(
					await readAnswers(db, row.id),
					checked.questionId,
					checked.itemId === "" ? undefined : checked.itemId,
					{
						value: checked.value === null ? null : (JSON.parse(checked.value) as AnswerValue),
						activeMs: 0,
						changes: 0,
					},
				),
			).unreached
		: [];
	// Written as SQL, because the insert has to be conditional too and Drizzle's cannot be.
	// SQLite evaluates every right-hand side of the update against the row as it was.
	// The answer is a value of the statement (`?4`), never part of its text: the text is what a
	// failure logs.
	// The update's own WHERE is what recognises a save that was applied before: the row has its
	// mark and its value already, so nothing of the row changes, its time least of all. A row
	// with no mark (written before the column, or by an older page) and a save with none never
	// match, and neither does a mark that comes with another value.
	const mark = progress.save ?? null;
	const upsert: Statement = {
		sql: `INSERT INTO answer (response_id, question_id, item_id, value, active_ms, changes, updated_at, save_id)
			SELECT ?1, ?2, ?3, ?4, ?5, 0, ?6, ?7
			WHERE EXISTS (SELECT 1 FROM response WHERE id = ?1 AND completed_at IS NULL)
			ON CONFLICT (response_id, question_id, item_id) DO UPDATE SET
				changes = answer.changes + (CASE WHEN answer.value IS NOT NULL AND answer.value IS NOT excluded.value THEN 1 ELSE 0 END),
				value = excluded.value,
				active_ms = answer.active_ms + excluded.active_ms,
				updated_at = excluded.updated_at,
				save_id = excluded.save_id
			WHERE excluded.save_id IS NULL OR answer.save_id IS NOT excluded.save_id
				OR answer.value IS NOT excluded.value`,
		params: [
			row.id,
			checked.questionId,
			checked.itemId,
			checked.value,
			progress.answer.activeMs,
			now,
			mark,
		],
	};
	const place: Statement = {
		sql: `UPDATE response SET updated_at = ?2, position = COALESCE(?3, position)
			WHERE id = ?1 AND completed_at IS NULL`,
		params: [row.id, now, progress.position ?? null],
	};
	// What the answer closes goes only with the answer. Each of these asks what the upsert asks:
	// when the row already has this mark and this value, the save was applied before and is
	// skipped, and a save that writes nothing deletes nothing either. That is why they run
	// before the upsert, in the same batch: after it, the row has the mark whichever happened.
	const isSaved = (each: { questionId: string; itemId: string }) =>
		each.questionId === checked.questionId && each.itemId === checked.itemId;
	const taken = stale
		.filter((each) => !isSaved(each))
		.map(
			({ questionId, itemId }): Statement => ({
				sql: `DELETE FROM answer WHERE response_id = ?1 AND question_id = ?2 AND item_id = ?3
					AND EXISTS (SELECT 1 FROM response WHERE id = ?1 AND completed_at IS NULL)
					AND (?4 IS NULL OR NOT EXISTS (SELECT 1 FROM answer
						WHERE response_id = ?1 AND question_id = ?5 AND item_id = ?6
							AND save_id IS ?4 AND value IS ?7))`,
				params: [
					row.id,
					questionId,
					itemId,
					mark,
					checked.questionId,
					checked.itemId,
					checked.value,
				],
			}),
		);
	// The answer being saved can be one the flow does not ask: its own question is closed (a
	// tab left open, a second device), and since it rules another it is in its own list. Its
	// row must not stay, and it is there only once the upsert has run. So this one delete comes
	// after the upsert, and asks nothing about the mark: sent again, the row is written and
	// taken back again, and nothing is left either time.
	const takenBack = stale.filter(isSaved).map(
		({ questionId, itemId }): Statement => ({
			sql: `DELETE FROM answer WHERE response_id = ?1 AND question_id = ?2 AND item_id = ?3
				AND EXISTS (SELECT 1 FROM response WHERE id = ?1 AND completed_at IS NULL)`,
			params: [row.id, questionId, itemId],
		}),
	);
	// Together or not at all: an answer without its place would resume one step behind. The
	// place is the last statement, and its count is what says the response was still open.
	const placed = (await runBatch(db, [...taken, upsert, ...takenBack, place])).at(-1);
	if (placed === 0) throw new Refusal(409, "This response is complete.");
}

/** For each definition, the ids of the questions some other question's rule looks at. */
const ruled = new WeakMap<Definition, Set<string>>();

function ruledBy(definition: Definition): Set<string> {
	const known = ruled.get(definition);
	if (known) return known;
	const found = new Set<string>();
	for (const { question } of placesOf(definition).questions.values()) {
		if (question.showIf) for (const id of referencedQuestions(question.showIf)) found.add(id);
	}
	ruled.set(definition, found);
	return found;
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
	const answers = await readAnswers(db, row.id);
	const missing = unansweredRequired(definition, answers);
	if (missing.length > 0) {
		throw new Refusal(422, "Some questions that need an answer have none.", {
			missing: missing.map((step) => step.key),
		});
	}

	// The same rule a saved answer applies, asked once more: rows written before that rule
	// existed, or by a request that raced another, must not outlive completion.
	const stale = reachedAnswers(definition, answers).unreached;

	const now = Date.now();
	await db.batch([
		// Only if it is still open: of two requests to complete, one does it and the other
		// changes nothing, so the time of completion is never moved.
		db
			.update(response)
			.set({ completedAt: now, updatedAt: now })
			.where(and(eq(response.id, row.id), isNull(response.completedAt))),
		// Deleted, not kept with a mark: a mark is something every export and every count
		// would have to remember, and one that forgot would report them as given.
		...stale.map(({ questionId, itemId }) =>
			db
				.delete(answer)
				.where(
					and(
						eq(answer.responseId, row.id),
						eq(answer.questionId, questionId),
						eq(answer.itemId, itemId),
					),
				),
		),
	]);
}

/**
 * Whether the person who holds a response's secret may take it back now. One that is not
 * complete, always. A complete one, when the definition it began under says "until the form
 * closes" and the form takes answers today: closing is when a study starts counting, and what
 * it has counted should not change under it. A response whose form is gone has nobody to ask.
 */
export function mayWithdraw(
	definition: Definition,
	form: Pick<Form, "state"> | undefined,
	completed: boolean,
): boolean {
	if (!completed) return true;
	return withdrawalOf(definition) === "until-closed" && form?.state === "open";
}

/** What became of a request to withdraw: done, or why not. */
export type Withdrawn = "withdrawn" | "complete" | "closed";

/**
 * Deletes a response with its answers, which is all there is of it: the times a question was
 * on screen are columns of the answers, and when it was begun and finished are columns of the
 * response. The person takes back what they gave. What the form kept apart stays: such a row
 * names no response, so there is nothing to find it by.
 *
 * The only trace is a count on the definition the response began under, one higher, so that
 * whoever runs the study can say how many withdrew. It says neither which nor when.
 *
 * `definition` is the one the response began under, and `form` the form as it is today.
 */
export async function withdrawResponse(
	db: Database,
	definition: Definition,
	row: ResponseRow,
	form: Pick<Form, "state"> | undefined,
): Promise<Withdrawn> {
	const afterCompletion = mayWithdraw(definition, form, true);
	// Everything read above was read a moment ago. A request that completes the response, or
	// one that closes the form, can arrive in between, so each statement asks again, and all of
	// them ask the same thing: they change something together or not at all.
	const changed = await runBatch(
		db,
		withdrawStatements({
			responseId: row.id,
			definitionHash: row.definitionHash,
			afterCompletion,
		}),
	);
	if (changed.at(-1)) return "withdrawn";
	return withdrawalOf(definition) === "until-complete" ? "complete" : "closed";
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
	const row = { id: randomRowId(), formId: form.definition.id, answers: stableJson(kept) };
	if (form.ownerId === null) {
		await db.insert(detachedAnswer).values(row);
		return;
	}
	// Only while the form is open, asked by the statement: one closed or deleted since it was
	// read takes no more rows. A row under a deleted form's id would be nobody's to delete.
	const [stored] = await runBatch(db, [keepApartStatement(row)]);
	if (!stored) throw new Refusal(404, "There is no such form.");
}
