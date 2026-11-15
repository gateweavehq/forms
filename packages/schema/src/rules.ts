import { z } from "zod";
import {
	type AnswerValue,
	isAnswered,
	isChoice,
	isChoices,
	isFields,
	isGrid,
	isRanking,
} from "./values";

/**
 * When a question is shown. A condition looks at one earlier answer, or combines conditions:
 *
 * - `{ question, is }`: the answer is that option (or that text or number). With `row`, the
 *   answer of that row of a grid.
 * - `{ question, isNot }`: anything else, a missing answer included.
 * - `{ question, includes }`: that option is among the chosen ones.
 * - `{ question, answered }`: there is an answer (`true`) or none (`false`).
 * - `{ all }`, `{ any }`, `{ not }`.
 *
 * Inside a repeat section's block, `question` means the same item's answer to it.
 */
export type Condition =
	| { question: string; row?: string | undefined; is: string | number }
	| { question: string; row?: string | undefined; isNot: string | number }
	| { question: string; includes: string }
	| { question: string; answered: boolean }
	| { all: Condition[] }
	| { any: Condition[] }
	| { not: Condition };

const reference = z.string().min(1);
const comparable = z.union([z.string(), z.number()]);

export const conditionSchema: z.ZodType<Condition, Condition> = z.lazy(() =>
	z.union([
		z.strictObject({ question: reference, row: reference.optional(), is: comparable }),
		z.strictObject({ question: reference, row: reference.optional(), isNot: comparable }),
		z.strictObject({ question: reference, includes: z.string().min(1) }),
		z.strictObject({ question: reference, answered: z.boolean() }),
		z.strictObject({ all: z.array(conditionSchema).min(1) }),
		z.strictObject({ any: z.array(conditionSchema).min(1) }),
		z.strictObject({ not: conditionSchema }),
	]),
);

/** The ids of the questions a condition looks at, with repeats. */
export function referencedQuestions(condition: Condition): string[] {
	if ("all" in condition) return condition.all.flatMap(referencedQuestions);
	if ("any" in condition) return condition.any.flatMap(referencedQuestions);
	if ("not" in condition) return referencedQuestions(condition.not);
	return [condition.question];
}

/** Every condition that looks at one answer, with the combining ones taken apart. */
export function leafConditions(
	condition: Condition,
): Array<Extract<Condition, { question: string }>> {
	if ("all" in condition) return condition.all.flatMap(leafConditions);
	if ("any" in condition) return condition.any.flatMap(leafConditions);
	if ("not" in condition) return leafConditions(condition.not);
	return [condition];
}

function equals(value: AnswerValue | undefined, row: string | undefined, to: string | number) {
	if (!isAnswered(value)) return false;
	if (typeof value === "string" || typeof value === "number") return value === to;
	if (isChoice(value)) return value.option === to;
	if (isGrid(value)) return row !== undefined && value.rows[row] === to;
	if (isFields(value)) return row !== undefined && value.fields[row] === to;
	return false;
}

function includes(value: AnswerValue | undefined, option: string): boolean {
	if (!isAnswered(value)) return false;
	if (isChoices(value)) return value.options.includes(option);
	if (isRanking(value)) return value.order.includes(option);
	if (isChoice(value)) return value.option === option;
	return false;
}

/**
 * Whether a condition holds. `answerOf` gives the answer a question has right now, or nothing
 * when it has none or is not shown: a hidden question's old answer must not keep later
 * questions open.
 */
export function holds(
	condition: Condition,
	answerOf: (question: string) => AnswerValue | undefined,
): boolean {
	if ("all" in condition) return condition.all.every((part) => holds(part, answerOf));
	if ("any" in condition) return condition.any.some((part) => holds(part, answerOf));
	if ("not" in condition) return !holds(condition.not, answerOf);
	const value = answerOf(condition.question);
	if ("is" in condition) return equals(value, condition.row, condition.is);
	if ("isNot" in condition) return !equals(value, condition.row, condition.isNot);
	if ("includes" in condition) return includes(value, condition.includes);
	return isAnswered(value) === condition.answered;
}
