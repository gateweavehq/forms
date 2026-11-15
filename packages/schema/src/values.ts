import { z } from "zod";

/**
 * What an answer holds, by the type of its question:
 *
 * - `short_text`, `long_text`, `email`: the text.
 * - `number`: the number.
 * - `single_choice`, `dropdown`: `{ option, text? }`, the text being the line an option asked for.
 * - `multiple_choice`: `{ options, texts? }`, the texts keyed by the option that asked.
 * - `ranking`: `{ order }`, best first. It may hold fewer options than the question has.
 * - `grid`: `{ rows }`, the chosen column for each answered row.
 * - `fields`: `{ fields }`, the text of each filled field.
 */
export type AnswerValue =
	| string
	| number
	| ChoiceValue
	| ChoicesValue
	| RankingValue
	| GridValue
	| FieldsValue;

export interface ChoiceValue {
	option: string;
	text?: string | undefined;
}
export interface ChoicesValue {
	options: string[];
	texts?: Record<string, string> | undefined;
}
export interface RankingValue {
	order: string[];
}
export interface GridValue {
	rows: Record<string, string>;
}
export interface FieldsValue {
	fields: Record<string, string>;
}

/**
 * The shape of any answer's value, without a question to check it against. What a response holds
 * was checked against its question when it was saved (`answerValueSchema`); this only keeps a
 * stored or received response from being something else entirely.
 */
export const anyAnswerValueSchema: z.ZodType<AnswerValue, AnswerValue> = z.union([
	z.string(),
	z.number(),
	z.strictObject({ option: z.string(), text: z.string().optional() }),
	z.strictObject({
		options: z.array(z.string()),
		texts: z.record(z.string(), z.string()).optional(),
	}),
	z.strictObject({ order: z.array(z.string()) }),
	z.strictObject({ rows: z.record(z.string(), z.string()) }),
	z.strictObject({ fields: z.record(z.string(), z.string()) }),
]);

export function isChoice(value: AnswerValue): value is ChoiceValue {
	return typeof value === "object" && "option" in value;
}
export function isChoices(value: AnswerValue): value is ChoicesValue {
	return typeof value === "object" && "options" in value;
}
export function isRanking(value: AnswerValue): value is RankingValue {
	return typeof value === "object" && "order" in value;
}
export function isGrid(value: AnswerValue): value is GridValue {
	return typeof value === "object" && "rows" in value;
}
export function isFields(value: AnswerValue): value is FieldsValue {
	return typeof value === "object" && "fields" in value;
}

/**
 * Whether a value says anything. A question that was seen and left empty is stored with `null`,
 * and an emptied text or selection counts the same, so rules and required questions agree on it.
 */
export function isAnswered(value: AnswerValue | null | undefined): value is AnswerValue {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim() !== "";
	if (typeof value === "number") return Number.isFinite(value);
	if (isChoices(value)) return value.options.length > 0;
	if (isRanking(value)) return value.order.length > 0;
	if (isGrid(value)) return Object.keys(value.rows).length > 0;
	if (isFields(value)) return Object.values(value.fields).some((text) => text.trim() !== "");
	return value.option !== "";
}
