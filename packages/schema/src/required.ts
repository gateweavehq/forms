import type { Question } from "./definition";
import { type AnswerValue, isAnswered, isFields, isGrid, isRanking } from "./values";

/** What a question that needs an answer still lacks. */
export type Missing =
	/** There is no answer at all. */
	| { kind: "answer" }
	/** These rows of a grid have no choice yet. */
	| { kind: "rows"; rows: string[] }
	/** These fields that need filling are empty. */
	| { kind: "fields"; fields: string[] }
	/** A ranking with only some of its options put in order. */
	| { kind: "ranking"; ranked: number; of: number };

/**
 * Whether a question has to be answered before a response can be completed: it is `required`,
 * or it has a field that is.
 */
export function needsAnswer(question: Question): boolean {
	if (question.required) return true;
	return question.type === "fields" && question.fields.some((field) => field.required);
}

/**
 * What is missing from the answer of a question that needs one, or nothing when it is whole.
 *
 * "Required" means all of the question. A grid asks one thing per row, so every row needs its
 * choice. A question with fields needs each field that is marked required, or every field when
 * the question itself is. A ranking is an order of all its options: half of one says nothing
 * about the rest. Anything less would let a required question pass with one row ticked.
 */
export function missingFrom(
	question: Question,
	value: AnswerValue | null | undefined,
): Missing | undefined {
	if (!needsAnswer(question)) return undefined;
	if (question.type === "fields") {
		const filled = isAnswered(value) && isFields(value) ? value.fields : {};
		const fields = question.fields
			.filter((field) => question.required || field.required)
			.filter((field) => !filled[field.id]?.trim())
			.map((field) => field.id);
		return fields.length > 0 ? { kind: "fields", fields } : undefined;
	}
	if (!isAnswered(value)) return { kind: "answer" };
	if (question.type === "grid" && isGrid(value)) {
		const rows = question.rows.filter((row) => !value.rows[row.id]).map((row) => row.id);
		return rows.length > 0 ? { kind: "rows", rows } : undefined;
	}
	if (question.type === "ranking" && isRanking(value)) {
		const [ranked, of] = [value.order.length, question.options.length];
		return ranked < of ? { kind: "ranking", ranked, of } : undefined;
	}
	return undefined;
}
