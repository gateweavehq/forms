import { z } from "zod";
import type { Option, Question } from "./definition";
import { type AnswerValue, anyAnswerValueSchema } from "./values";

/** The version of the answers' shape. A breaking change to it raises this. */
export const ANSWERS_VERSION = 1;

/** The longest texts an answer may hold. Generous for a person, small for a database row. */
export const MAX_SHORT_TEXT = 500;
export const MAX_LONG_TEXT = 10_000;

/** One answer, with what was measured while it was given. */
export const answerSchema = z.strictObject({
	/** `null` when the question was shown and left without an answer. */
	value: anyAnswerValueSchema.nullable(),
	/** Milliseconds the question was on screen in a visible tab, over every visit to it. */
	activeMs: z.number().int().min(0),
	/** How often an answer already given was replaced by a different one. */
	changes: z.number().int().min(0),
});

/**
 * A response's answers: plain data keyed by question id, and by item id first for the questions
 * of a repeat section's block. Ids are unique across a form, so the two maps never collide.
 */
export const responseAnswersSchema = z.strictObject({
	version: z.literal(ANSWERS_VERSION),
	questions: z.record(z.string(), answerSchema),
	items: z.record(z.string(), z.record(z.string(), answerSchema)),
});

export type Answer = z.infer<typeof answerSchema>;
export type ResponseAnswers = z.infer<typeof responseAnswersSchema>;

export function emptyAnswers(): ResponseAnswers {
	return { version: ANSWERS_VERSION, questions: {}, items: {} };
}

/** The answer to a question, of an item when the question belongs to a block. */
export function getAnswer(
	answers: ResponseAnswers,
	question: string,
	item?: string,
): Answer | undefined {
	return item === undefined ? answers.questions[question] : answers.items[item]?.[question];
}

/** The answers with one of them set. The original is left as it was. */
export function withAnswer(
	answers: ResponseAnswers,
	question: string,
	item: string | undefined,
	answer: Answer,
): ResponseAnswers {
	if (item === undefined) {
		return { ...answers, questions: { ...answers.questions, [question]: answer } };
	}
	return {
		...answers,
		items: { ...answers.items, [item]: { ...answers.items[item], [question]: answer } },
	};
}

function optionIds(options: Option[]): [string, ...string[]] {
	return options.map((option) => option.id) as [string, ...string[]];
}

function unique(ids: string[]): boolean {
	return new Set(ids).size === ids.length;
}

/** The options of a question that ask for a line of text. */
function specifying(options: Option[]): Set<string> {
	return new Set(options.filter((option) => option.specify).map((option) => option.id));
}

const shortText = z.string().min(1).max(MAX_SHORT_TEXT);

/**
 * What an answer to this question may be. Used where an answer arrives from outside: the server
 * checks every answer it is sent with this before storing it.
 */
export function answerValueSchema(question: Question): z.ZodType<AnswerValue> {
	switch (question.type) {
		case "short_text":
			return shortText;
		case "long_text":
			return z.string().min(1).max(MAX_LONG_TEXT);
		case "email":
			return z.email().max(254);
		case "number": {
			let number = z.number();
			if (question.integer) number = number.int();
			if (question.min !== undefined) number = number.min(question.min);
			if (question.max !== undefined) number = number.max(question.max);
			return number;
		}
		case "single_choice":
		case "dropdown": {
			const asks = specifying(question.options);
			return z
				.strictObject({ option: z.enum(optionIds(question.options)), text: shortText.optional() })
				.refine((value) => value.text === undefined || asks.has(value.option), {
					message: "Only an option that asks for text can carry one",
				});
		}
		case "multiple_choice": {
			const asks = specifying(question.options);
			const ids = z.array(z.enum(optionIds(question.options))).min(1);
			return z
				.strictObject({
					options: question.max === undefined ? ids : ids.max(question.max),
					texts: z.record(z.string(), shortText).optional(),
				})
				.refine((value) => unique(value.options), { message: "An option can be chosen once" })
				.refine(
					(value) =>
						Object.keys(value.texts ?? {}).every(
							(id) => asks.has(id) && value.options.includes(id),
						),
					{ message: "Only a chosen option that asks for text can carry one" },
				);
		}
		case "ranking":
			return z
				.strictObject({ order: z.array(z.enum(optionIds(question.options))).min(1) })
				.refine((value) => unique(value.order), { message: "An option can be ranked once" });
		case "grid": {
			const rows = new Set(question.rows.map((row) => row.id));
			const columns = new Set(question.columns.map((column) => column.id));
			return z
				.strictObject({ rows: z.record(z.string(), z.string()) })
				.refine((value) => Object.keys(value.rows).length > 0, { message: "No row is answered" })
				.refine(
					(value) =>
						Object.entries(value.rows).every(
							([row, column]) => rows.has(row) && columns.has(column),
						),
					{ message: "A row or column is not one of this question's" },
				);
		}
		case "fields": {
			const fields = new Set(question.fields.map((field) => field.id));
			return z
				.strictObject({ fields: z.record(z.string(), shortText) })
				.refine((value) => Object.keys(value.fields).length > 0, { message: "No field is filled" })
				.refine((value) => Object.keys(value.fields).every((id) => fields.has(id)), {
					message: "A field is not one of this question's",
				});
		}
	}
}
