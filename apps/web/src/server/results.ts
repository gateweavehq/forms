import type { ResponseRecord } from "@gateweave/forms-results";
import {
	type AnswerValue,
	type Definition,
	detachedQuestions,
	emptyAnswers,
	type Question,
	type ResponseAnswers,
	withAnswer,
} from "@gateweave/forms-schema";
import { and, eq } from "drizzle-orm";
import { type Database, readRows } from "./db";
import { definition as definitions, detachedAnswer, response } from "./db/schema";
import { readStored } from "./forms";
import { definitionOfVersion, type FormRow } from "./owner";

/**
 * Reading a form's responses for its owner. Everything here takes the form's row, which only
 * `ownedForm` gives out: there is no way to ask for results by a form's id alone.
 */

/** How many answers one query reads. A form with long sections has hundreds per response. */
const PAGE = 20_000;

interface AnswerRow {
	response_id: string;
	question_id: string;
	item_id: string;
	value: string | null;
	active_ms: number;
	changes: number;
}

/**
 * The version of a form the results are asked for: the one named, when the form has had it, and
 * otherwise the one new responses start under.
 */
export async function versionOf(
	db: Database,
	row: FormRow,
	asked: string | undefined,
): Promise<{ hash: string; definition: Definition }> {
	if (asked && asked !== row.definitionHash) {
		const found = await definitionOfVersion(db, row, asked);
		if (found) return { hash: asked, definition: found };
	}
	const current = await definitionOfVersion(db, row, row.definitionHash);
	if (!current) throw new Error("A form's definition is missing");
	return { hash: row.definitionHash, definition: current };
}

function add(answers: ResponseAnswers, row: AnswerRow): ResponseAnswers {
	return withAnswer(answers, row.question_id, row.item_id === "" ? undefined : row.item_id, {
		value: row.value === null ? null : (JSON.parse(row.value) as AnswerValue),
		activeMs: row.active_ms,
		changes: row.changes,
	});
}

/**
 * Every response to one version of a form, oldest first, with its answers. The numbers of one
 * version are never mixed with another's: the same question id can mean something else there.
 */
export async function loadRecords(
	db: Database,
	row: FormRow,
	hash: string,
): Promise<ResponseRecord[]> {
	const rows = await db
		.select()
		.from(response)
		.where(and(eq(response.formId, row.id), eq(response.definitionHash, hash)))
		.orderBy(response.createdAt, response.id)
		.all();
	const answers = new Map<string, ResponseAnswers>(rows.map(({ id }) => [id, emptyAnswers()]));

	// Read in pages, each beginning after the last row of the one before, in the order of the
	// answers' primary key.
	let after: [string, string, string] = ["", "", ""];
	for (;;) {
		const results = await readRows<AnswerRow>(db, {
			sql: `SELECT answer.response_id, answer.question_id, answer.item_id, answer.value,
					answer.active_ms, answer.changes
				FROM response JOIN answer ON answer.response_id = response.id
				WHERE response.form_id = ?1 AND response.definition_hash = ?2
					AND (answer.response_id, answer.question_id, answer.item_id) > (?3, ?4, ?5)
				ORDER BY answer.response_id, answer.question_id, answer.item_id
				LIMIT ?6`,
			params: [row.id, hash, ...after, PAGE],
		});
		for (const found of results) {
			const own = answers.get(found.response_id);
			if (own) answers.set(found.response_id, add(own, found));
		}
		const last = results.at(-1);
		if (!last || results.length < PAGE) break;
		after = [last.response_id, last.question_id, last.item_id];
	}

	return rows.map((found) => ({
		id: found.id,
		device: found.device,
		createdAt: found.createdAt,
		completedAt: found.completedAt,
		position: found.position,
		answers: answers.get(found.id) ?? emptyAnswers(),
	}));
}

/** One response of this form with its answers and the definition it was given to, or nothing. */
export async function loadRecord(
	db: Database,
	row: FormRow,
	responseId: string,
): Promise<{ record: ResponseRecord; definition: Definition; hash: string } | undefined> {
	const found = await db
		.select()
		.from(response)
		.where(and(eq(response.id, responseId), eq(response.formId, row.id)))
		.get();
	if (!found) return undefined;
	const stored = await db
		.select({ json: definitions.json })
		.from(definitions)
		.where(eq(definitions.hash, found.definitionHash))
		.get();
	if (!stored) throw new Error("A response's definition is missing");
	const results = await readRows<AnswerRow>(db, {
		sql: `SELECT response_id, question_id, item_id, value, active_ms, changes
			FROM answer WHERE response_id = ?1`,
		params: [found.id],
	});
	return {
		record: {
			id: found.id,
			device: found.device,
			createdAt: found.createdAt,
			completedAt: found.completedAt,
			position: found.position,
			answers: results.reduce(add, emptyAnswers()),
		},
		definition: readStored(found.definitionHash, stored.json),
		hash: found.definitionHash,
	};
}

/** A form shows what it keeps apart only when it holds at least this many rows. */
export const DETACHED_MIN = 5;

/**
 * What a form keeps apart, or why it is not shown yet.
 *
 * - `open`: the form still takes answers. A row that appears here moments after a response
 *   was completed belongs to that response, whatever the row itself leaves out.
 * - `few`: closed, with fewer rows than `DETACHED_MIN`. Among so few, counting pairs them.
 * - `shown`: closed, with enough.
 */
export type Detached =
	| { state: "open" }
	| { state: "few"; needed: number }
	| { state: "shown"; questions: Question[]; rows: Array<Record<string, unknown>> };

/** A list in an order drawn anew, each order as likely as any other. */
function shuffled<Entry>(list: Entry[]): Entry[] {
	const result = [...list];
	for (let last = result.length - 1; last > 0; last--) {
		// Drawn again when it falls in the uneven end of the range, so that no place is likelier.
		const span = last + 1;
		const limit = Math.floor(2 ** 32 / span) * span;
		let drawn: number;
		do {
			drawn = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
		} while (drawn >= limit);
		const other = drawn % span;
		const kept = result[last] as Entry;
		result[last] = result[other] as Entry;
		result[other] = kept;
	}
	return result;
}

/**
 * The answers a form keeps apart, with the questions they answer, for its owner.
 *
 * The owner sees responses arrive with their times, so a list that grew in step with them
 * would pair each row with a response. It is therefore given only once the form is closed and
 * holds enough rows, and in an order drawn anew on every read: not the order of arrival, which
 * is not stored, and not one fixed order either, in which a row added after reopening the form
 * would stand out by its place.
 *
 * The questions are those of every version the form has had, since a row does not say which it
 * was given to.
 */
export async function loadDetached(db: Database, row: FormRow): Promise<Detached> {
	if (row.state !== "closed") return { state: "open" };
	const stored = await db
		.select({ hash: definitions.hash, json: definitions.json })
		.from(definitions)
		.where(eq(definitions.formId, row.id))
		.all();
	const rows = await db
		.select({ answers: detachedAnswer.answers })
		.from(detachedAnswer)
		.where(eq(detachedAnswer.formId, row.id))
		.all();
	if (rows.length < DETACHED_MIN) return { state: "few", needed: DETACHED_MIN - rows.length };
	const questions = new Map<string, Question>();
	// The current wording first, so that it is the one shown for a question every version has.
	for (const { hash, json } of stored.sort(
		(a, b) => Number(b.hash === row.definitionHash) - Number(a.hash === row.definitionHash),
	)) {
		for (const question of detachedQuestions(readStored(hash, json))) {
			if (!questions.has(question.id)) questions.set(question.id, question);
		}
	}
	return {
		state: "shown",
		questions: [...questions.values()],
		rows: shuffled(rows).map(({ answers }) => JSON.parse(answers) as Record<string, unknown>),
	};
}
