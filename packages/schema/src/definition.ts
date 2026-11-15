import { z } from "zod";
import { conditionSchema } from "./rules";
import { richTextSchema } from "./text";

/** The version of the definition's format. A breaking change to a shape below raises it. */
export const DEFINITION_VERSION = 1;

/**
 * Ids are what answers are stored under and what rules point at, so they have to stay the same
 * while wording changes. Lowercase letters, digits, `-` and `_`: safe in an address and as a
 * column name in an export.
 */
export const idSchema = z
	.string()
	.regex(
		/^[a-z0-9][a-z0-9_-]*$/,
		"An id is lowercase letters, digits, - and _, starting with a letter or digit",
	)
	.max(64);

const label = z.string().min(1);

export const optionSchema = z.strictObject({
	id: idSchema,
	label,
	/** Asks for a line of text when chosen, as in "Other, please specify". */
	specify: z.boolean().optional(),
});

const rowSchema = z.strictObject({ id: idSchema, label });
const columnSchema = z.strictObject({ id: idSchema, label });
const fieldSchema = z.strictObject({
	id: idSchema,
	label,
	placeholder: z.string().optional(),
	/** This field has to be filled, whether or not the question as a whole is required. */
	required: z.boolean().optional(),
});

const questionBase = {
	id: idSchema,
	/** The question as asked. Inside a block it may use `{{item.label}}` or `{{item.name}}`. */
	label,
	/** Shown under the question, always. */
	description: richTextSchema.optional(),
	/** Shown under the question behind a "more" control. */
	detail: richTextSchema.optional(),
	/**
	 * A question can be passed without an answer unless this is set. Set, it means all of the
	 * question: every row of a grid, every field, a ranking of every option.
	 */
	required: z.boolean().optional(),
	showIf: conditionSchema.optional(),
	/**
	 * The answer is asked at the end and stored apart, without anything that names the response:
	 * for contact details a study wants kept away from the answers. That is less than
	 * unlinkable, and a form's own text must not promise more (docs/architecture.md).
	 */
	detached: z.boolean().optional(),
};

const options = z.array(optionSchema).min(1);

export const questionSchema = z.discriminatedUnion("type", [
	z.strictObject({
		...questionBase,
		type: z.literal("short_text"),
		placeholder: z.string().optional(),
	}),
	z.strictObject({
		...questionBase,
		type: z.literal("long_text"),
		placeholder: z.string().optional(),
	}),
	z.strictObject({
		...questionBase,
		type: z.literal("number"),
		placeholder: z.string().optional(),
		min: z.number().optional(),
		max: z.number().optional(),
		integer: z.boolean().optional(),
	}),
	z.strictObject({ ...questionBase, type: z.literal("email"), placeholder: z.string().optional() }),
	z.strictObject({ ...questionBase, type: z.literal("single_choice"), options }),
	z.strictObject({
		...questionBase,
		type: z.literal("multiple_choice"),
		options,
		/** The most options that may be chosen, as in "up to 3". */
		max: z.number().int().min(1).optional(),
	}),
	z.strictObject({ ...questionBase, type: z.literal("dropdown"), options }),
	z.strictObject({ ...questionBase, type: z.literal("ranking"), options: options.min(2) }),
	/** Rows with one choice each among the same columns. */
	z.strictObject({
		...questionBase,
		type: z.literal("grid"),
		rows: z.array(rowSchema).min(1),
		columns: z.array(columnSchema).min(2),
	}),
	/** Several short lines under one question, each with its own label. */
	z.strictObject({
		...questionBase,
		type: z.literal("fields"),
		fields: z.array(fieldSchema).min(1),
	}),
]);

export const itemSchema = z.strictObject({
	id: idSchema,
	/** What the card is headed with. */
	label,
	/**
	 * What `{{item.name}}` puts into a question's wording, when that differs from the label (a
	 * label may carry a code, as in "B2: Rye bread"). The label when absent.
	 */
	name: label.optional(),
	/** One line saying what the item is, shown under the label. */
	definition: z.string().min(1).optional(),
	/** Longer text behind a "more" control. */
	detail: richTextSchema.optional(),
});

export const groupSchema = z.strictObject({
	id: idSchema,
	title: label,
	items: z.array(itemSchema).min(1),
});

export const blockSchema = z.strictObject({
	/** Asked for every item of a group, one item to a card, before any follow-up. */
	status: z.array(questionSchema).min(1),
	/** Asked after a group's status questions, only for the items their rules match. */
	followUps: z.array(questionSchema).default([]),
	/**
	 * Introduces a group's follow-ups. `{{count}}` is the number of items that have any, as in
	 * "You stopped making {{count}} of these. A few questions about each."
	 */
	followUpsIntro: z.string().min(1).optional(),
});

const sectionBase = {
	id: idSchema,
	title: label,
	text: richTextSchema.optional(),
};

export const questionsSectionSchema = z.strictObject({
	...sectionBase,
	type: z.literal("questions"),
	/** May be empty: a section of text alone. */
	questions: z.array(questionSchema),
});

export const repeatSectionSchema = z.strictObject({
	...sectionBase,
	type: z.literal("repeat"),
	groups: z.array(groupSchema).min(1),
	block: blockSchema,
});

export const sectionSchema = z.discriminatedUnion("type", [
	questionsSectionSchema,
	repeatSectionSchema,
]);

export const consentSchema = z.strictObject({
	title: label.optional(),
	text: richTextSchema,
	/** What the person agrees to by ticking, in the first person. */
	statement: label,
});

export const endSchema = z.strictObject({
	title: label.optional(),
	text: richTextSchema.optional(),
});

/**
 * A form: ordered sections, which the person answering sees as legs. This checks shapes only;
 * `parseDefinition` also checks that ids are unique and that rules point at real, earlier
 * questions.
 */
export const definitionSchema = z.strictObject({
	version: z.literal(DEFINITION_VERSION),
	/** Names the form in its address, `/f/<id>`. */
	id: idSchema,
	title: label,
	/** Shown before any question, when the form has one. Nothing is stored until it is given. */
	consent: consentSchema.optional(),
	sections: z.array(sectionSchema).min(1),
	end: endSchema.optional(),
});

export type Option = z.infer<typeof optionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question["type"];
export type Item = z.infer<typeof itemSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Block = z.infer<typeof blockSchema>;
export type QuestionsSection = z.infer<typeof questionsSectionSchema>;
export type RepeatSection = z.infer<typeof repeatSectionSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Consent = z.infer<typeof consentSchema>;
export type Definition = z.infer<typeof definitionSchema>;
/** A definition as written, before defaults are filled in. */
export type DefinitionInput = z.input<typeof definitionSchema>;
