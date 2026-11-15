import {
	type Answer,
	type Definition,
	type Item,
	isAnswered,
	isChoice,
	isChoices,
	isFields,
	isGrid,
	isRanking,
	mergeItem,
	type Question,
	type QuestionType,
} from "@gateweave/forms-schema";
import { mean, median } from "./numbers";
import { allReached, type ResponseRecord } from "./records";

/** One option of a question, with how many chose it and the lines they wrote beside it. */
export interface OptionCount {
	id: string;
	label: string;
	count: number;
	/** What people wrote for an option that asks for a line of text. */
	texts: string[];
}

/** What the answers to one question add up to, by the kind of question. */
export type Tally =
	| { kind: "options"; options: OptionCount[] }
	| {
			kind: "number";
			min: number | null;
			max: number | null;
			mean: number | null;
			median: number | null;
	  }
	| { kind: "texts"; texts: string[] }
	| {
			kind: "ranking";
			/** Mean place, 1 being first, among the responses that placed the option at all. */
			options: Array<{
				id: string;
				label: string;
				ranked: number;
				first: number;
				meanPlace: number | null;
			}>;
	  }
	| {
			kind: "grid";
			rows: Array<{
				id: string;
				label: string;
				columns: Array<{ id: string; label: string; count: number }>;
			}>;
	  }
	| { kind: "fields"; fields: Array<{ id: string; label: string; texts: string[] }> };

export interface QuestionSummary {
	id: string;
	label: string;
	type: QuestionType;
	/** Responses that were shown the question, whether or not they answered. */
	seen: number;
	/** Responses that gave an answer. Every share on the page is out of this. */
	answered: number;
	/** The median time the question was on screen, over the responses that were shown it. */
	medianMs: number | null;
	/** How many answers were replaced by a different one, added up. */
	changes: number;
	tally: Tally;
}

/** What the given answers to one question add up to. `label` is the wording to show. */
export function summarise(question: Question, label: string, answers: Answer[]): QuestionSummary {
	const values = answers.map((answer) => answer.value).filter(isAnswered);
	return {
		id: question.id,
		label,
		type: question.type,
		seen: answers.length,
		answered: values.length,
		medianMs: median(answers.map((answer) => answer.activeMs)),
		changes: answers.reduce((sum, answer) => sum + answer.changes, 0),
		tally: tallyOf(question, values),
	};
}

function tallyOf(question: Question, values: Array<NonNullable<Answer["value"]>>): Tally {
	switch (question.type) {
		case "short_text":
		case "long_text":
		case "email":
			return { kind: "texts", texts: values.filter((value) => typeof value === "string") };
		case "number": {
			const numbers = values.filter((value) => typeof value === "number");
			return {
				kind: "number",
				min: numbers.length ? Math.min(...numbers) : null,
				max: numbers.length ? Math.max(...numbers) : null,
				mean: mean(numbers),
				median: median(numbers),
			};
		}
		case "single_choice":
		case "dropdown": {
			const chosen = values.filter(isChoice);
			return {
				kind: "options",
				options: question.options.map((option) => {
					const own = chosen.filter((value) => value.option === option.id);
					return {
						id: option.id,
						label: option.label,
						count: own.length,
						texts: own.flatMap((value) => (value.text ? [value.text] : [])),
					};
				}),
			};
		}
		case "multiple_choice": {
			const chosen = values.filter(isChoices);
			return {
				kind: "options",
				options: question.options.map((option) => {
					const own = chosen.filter((value) => value.options.includes(option.id));
					return {
						id: option.id,
						label: option.label,
						count: own.length,
						texts: own.flatMap((value) => {
							const text = value.texts?.[option.id];
							return text ? [text] : [];
						}),
					};
				}),
			};
		}
		case "ranking": {
			const orders = values.filter(isRanking).map((value) => value.order);
			return {
				kind: "ranking",
				options: question.options.map((option) => {
					const places = orders
						.map((order) => order.indexOf(option.id) + 1)
						.filter((place) => place > 0);
					return {
						id: option.id,
						label: option.label,
						ranked: places.length,
						first: places.filter((place) => place === 1).length,
						meanPlace: mean(places),
					};
				}),
			};
		}
		case "grid": {
			const grids = values.filter(isGrid).map((value) => value.rows);
			return {
				kind: "grid",
				rows: question.rows.map((row) => ({
					id: row.id,
					label: row.label,
					columns: question.columns.map((column) => ({
						id: column.id,
						label: column.label,
						count: grids.filter((rows) => rows[row.id] === column.id).length,
					})),
				})),
			};
		}
		case "fields": {
			const filled = values.filter(isFields).map((value) => value.fields);
			return {
				kind: "fields",
				fields: question.fields.map((field) => ({
					id: field.id,
					label: field.label,
					texts: filled.flatMap((fields) => {
						const text = fields[field.id];
						return text?.trim() ? [text] : [];
					}),
				})),
			};
		}
	}
}

export interface SectionSummary {
	id: string;
	title: string;
	questions: QuestionSummary[];
}

/**
 * Every question that is asked once per response, section by section. A repeat section's
 * questions are in the items table (`repeatTables`), and detached answers are never with a
 * response, so neither is here.
 */
export function questionSummaries(
	definition: Definition,
	given: ResponseRecord[],
): SectionSummary[] {
	const records = allReached(definition, given);
	return definition.sections.flatMap((section) => {
		if (section.type !== "questions") return [];
		const questions = section.questions
			.filter((question) => !question.detached)
			.map((question) =>
				summarise(
					question,
					question.label,
					records.flatMap((record) => {
						const answer = record.answers.questions[question.id];
						return answer ? [answer] : [];
					}),
				),
			);
		return questions.length > 0 ? [{ id: section.id, title: section.title, questions }] : [];
	});
}

export interface ItemSummary {
	id: string;
	label: string;
	/** The block's status questions for this item, in order. */
	status: QuestionSummary[];
	/** The block's follow-up questions for this item, in order. Most are seen by few. */
	followUps: QuestionSummary[];
}

export interface RepeatTable {
	id: string;
	title: string;
	groups: Array<{ id: string; title: string; items: ItemSummary[] }>;
}

function itemAnswers(records: ResponseRecord[], item: Item, question: Question): Answer[] {
	return records.flatMap((record) => {
		const answer = record.answers.items[item.id]?.[question.id];
		return answer ? [answer] : [];
	});
}

/** A repeat section as a table: each item with what was answered about it. */
export function repeatTables(definition: Definition, given: ResponseRecord[]): RepeatTable[] {
	const records = allReached(definition, given);
	return definition.sections.flatMap((section) => {
		if (section.type !== "repeat") return [];
		const forItem = (item: Item, questions: Question[]) =>
			questions.map((question) =>
				summarise(question, mergeItem(question.label, item), itemAnswers(records, item, question)),
			);
		return [
			{
				id: section.id,
				title: section.title,
				groups: section.groups.map((group) => ({
					id: group.id,
					title: group.title,
					items: group.items.map((item) => ({
						id: item.id,
						label: item.label,
						status: forItem(item, section.block.status),
						followUps: forItem(item, section.block.followUps),
					})),
				})),
			},
		];
	});
}
