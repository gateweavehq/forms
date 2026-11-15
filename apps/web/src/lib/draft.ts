import {
	type AnswerValue,
	emailSchema,
	isChoice,
	isChoices,
	isFields,
	isGrid,
	isRanking,
	MAX_LONG_TEXT,
	MAX_SHORT_TEXT,
	type Question,
} from "@gateweave/forms-schema";
import { strings } from "./strings";

/**
 * An answer while it is being given: what the inputs hold, which is not always an answer yet
 * (half a number, no option, an empty line).
 */
export interface Draft {
	/** The text of a text, number or email input. */
	text: string;
	/** The chosen option of a single choice or dropdown. Empty when none. */
	option: string;
	/** The chosen options of a multiple choice, or a ranking's order. */
	options: string[];
	/** The lines typed for options that ask for one, by option. */
	texts: Record<string, string>;
	/** A grid's chosen column by row, or a question's fields by id. */
	rows: Record<string, string>;
}

const EMPTY: Draft = { text: "", option: "", options: [], texts: {}, rows: {} };

/** The draft that shows a stored answer, or an empty one. */
export function toDraft(value: AnswerValue | null | undefined): Draft {
	if (value === null || value === undefined) return EMPTY;
	if (typeof value === "string") return { ...EMPTY, text: value };
	if (typeof value === "number") return { ...EMPTY, text: String(value) };
	if (isChoice(value)) {
		const texts = value.text === undefined ? {} : { [value.option]: value.text };
		return { ...EMPTY, option: value.option, texts };
	}
	if (isChoices(value)) return { ...EMPTY, options: value.options, texts: value.texts ?? {} };
	if (isRanking(value)) return { ...EMPTY, options: value.order };
	if (isGrid(value)) return { ...EMPTY, rows: value.rows };
	if (isFields(value)) return { ...EMPTY, rows: value.fields };
	return EMPTY;
}

export type Checked = { ok: true; value: AnswerValue | null } | { ok: false; problem: string };

const answer = (value: AnswerValue | null): Checked => ({ ok: true, value });
const problem = (text: string): Checked => ({ ok: false, problem: text });

/** A decimal as people type it: with a point or a comma. */
function parseNumber(text: string): number | undefined {
	const normal = text.trim().replace(",", ".");
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(normal)) return undefined;
	return Number(normal);
}

/** The lines of the chosen options that ask for one, when anything was typed. */
function specified(question: Question, chosen: string[], texts: Record<string, string>) {
	if (!("options" in question)) return {};
	const kept: Record<string, string> = {};
	for (const option of question.options) {
		const text = texts[option.id]?.trim();
		if (option.specify && chosen.includes(option.id) && text) kept[option.id] = text;
	}
	return kept;
}

/**
 * Turns what the inputs hold into the answer to store: a value, `null` for nothing, or what is
 * wrong with it in words the person can act on. The server checks again; this is so that the
 * person hears about a slip while they can still fix it.
 */
export function fromDraft(question: Question, draft: Draft): Checked {
	const checked = read(question, draft);
	if (checked.ok && checked.value === null && question.required) {
		return problem(strings.problem.required);
	}
	return checked;
}

function read(question: Question, draft: Draft): Checked {
	switch (question.type) {
		case "short_text":
		case "long_text": {
			const text = draft.text.trim();
			const max = question.type === "short_text" ? MAX_SHORT_TEXT : MAX_LONG_TEXT;
			if (text.length > max) return problem(strings.problem.tooLong(max));
			return answer(text === "" ? null : text);
		}
		case "email": {
			const text = draft.text.trim();
			if (text === "") return answer(null);
			// The server's own check, so that what passes here is not refused there.
			return emailSchema.safeParse(text).success ? answer(text) : problem(strings.problem.email);
		}
		case "number": {
			if (draft.text.trim() === "") return answer(null);
			const number = parseNumber(draft.text);
			if (number === undefined) return problem(strings.problem.number);
			if (question.integer && !Number.isInteger(number)) return problem(strings.problem.integer);
			if (question.min !== undefined && number < question.min) {
				return problem(strings.problem.min(question.min));
			}
			if (question.max !== undefined && number > question.max) {
				return problem(strings.problem.max(question.max));
			}
			return answer(number);
		}
		case "single_choice":
		case "dropdown": {
			if (!question.options.some((option) => option.id === draft.option)) return answer(null);
			const text = specified(question, [draft.option], draft.texts)[draft.option];
			if (text && text.length > MAX_SHORT_TEXT)
				return problem(strings.problem.tooLong(MAX_SHORT_TEXT));
			return answer({ option: draft.option, ...(text ? { text } : {}) });
		}
		case "multiple_choice": {
			const options = question.options
				.map((option) => option.id)
				.filter((id) => draft.options.includes(id));
			if (options.length === 0) return answer(null);
			const texts = specified(question, options, draft.texts);
			if (Object.values(texts).some((text) => text.length > MAX_SHORT_TEXT)) {
				return problem(strings.problem.tooLong(MAX_SHORT_TEXT));
			}
			return answer({ options, ...(Object.keys(texts).length > 0 ? { texts } : {}) });
		}
		case "ranking": {
			const known = new Set(question.options.map((option) => option.id));
			const order = draft.options.filter((id) => known.has(id));
			return answer(order.length === 0 ? null : { order });
		}
		case "grid": {
			const rows: Record<string, string> = {};
			for (const row of question.rows) {
				const column = draft.rows[row.id];
				if (question.columns.some((candidate) => candidate.id === column) && column) {
					rows[row.id] = column;
				}
			}
			return answer(Object.keys(rows).length === 0 ? null : { rows });
		}
		case "fields": {
			const fields: Record<string, string> = {};
			for (const field of question.fields) {
				const text = draft.rows[field.id]?.trim();
				if (!text) continue;
				if (text.length > MAX_SHORT_TEXT) return problem(strings.problem.tooLong(MAX_SHORT_TEXT));
				fields[field.id] = text;
			}
			return answer(Object.keys(fields).length === 0 ? null : { fields });
		}
	}
}

/** Whether the inputs hold nothing that would be stored: the button then says "Skip". */
export function isEmptyDraft(question: Question, draft: Draft): boolean {
	const checked = read(question, draft);
	return checked.ok && checked.value === null;
}
