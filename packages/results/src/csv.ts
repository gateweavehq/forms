import {
	type AnswerValue,
	type Definition,
	type Item,
	isChoice,
	isChoices,
	isFields,
	isGrid,
	isRanking,
	mergeItem,
	type Question,
} from "@gateweave/forms-schema";
import { activeMsOf, allReached, type ResponseRecord } from "./records";

type Cell = string | number;

/**
 * A spreadsheet runs a cell that begins with one of these as a formula. Answers are typed by
 * strangers, and the person who opens the export is the one a formula would run for.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as CSV. Text that a spreadsheet would run is given a leading apostrophe. */
function cell(value: Cell): string {
	if (typeof value === "number") return String(value);
	const safe = FORMULA_START.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Rows as CSV text: RFC 4180, with a header, CRLF line ends and one at the end. */
export function toCsv(header: string[], rows: Cell[][]): string {
	return [header, ...rows].map((row) => `${row.map(cell).join(",")}\r\n`).join("");
}

/** One column of the wide export: its name, what it means, and how to read it off a value. */
export interface Column {
	name: string;
	questionId: string;
	itemId: string;
	/** The question's wording, for an item's question with the item's name filled in. */
	label: string;
	type: string;
	/** What a cell holds, in words. */
	values: string;
	read: (value: AnswerValue) => Cell;
}

const optionList = (options: Array<{ id: string; label: string }>) =>
	options.map((option) => `${option.id} = ${option.label}`).join("; ");

/** The columns one question takes. A block's question has them once for each item. */
function columnsOf(question: Question, label: string, itemId: string): Column[] {
	const name = itemId ? `${itemId}.${question.id}` : question.id;
	const base = { questionId: question.id, itemId, label, type: question.type };
	switch (question.type) {
		case "short_text":
		case "long_text":
		case "email":
			return [
				{
					...base,
					name,
					values: "The text",
					read: (value) => (typeof value === "string" ? value : ""),
				},
			];
		case "number":
			return [
				{
					...base,
					name,
					values: "The number",
					read: (value) => (typeof value === "number" ? value : ""),
				},
			];
		case "single_choice":
		case "dropdown": {
			const columns: Column[] = [
				{
					...base,
					name,
					values: optionList(question.options),
					read: (value) => (isChoice(value) ? value.option : ""),
				},
			];
			if (question.options.some((option) => option.specify)) {
				columns.push({
					...base,
					name: `${name}.text`,
					values: "The line written beside the chosen option",
					read: (value) => (isChoice(value) ? (value.text ?? "") : ""),
				});
			}
			return columns;
		}
		case "multiple_choice":
			return question.options.flatMap((option) => {
				const columns: Column[] = [
					{
						...base,
						name: `${name}.${option.id}`,
						label: `${label} [${option.label}]`,
						values: "1 = chosen; 0 = not chosen",
						read: (value) => (isChoices(value) && value.options.includes(option.id) ? 1 : 0),
					},
				];
				if (option.specify) {
					columns.push({
						...base,
						name: `${name}.${option.id}.text`,
						label: `${label} [${option.label}]`,
						values: "The line written beside the option",
						read: (value) => (isChoices(value) ? (value.texts?.[option.id] ?? "") : ""),
					});
				}
				return columns;
			});
		case "ranking":
			return question.options.map((option) => ({
				...base,
				name: `${name}.${option.id}`,
				label: `${label} [${option.label}]`,
				values: "The place it was given, 1 being first; empty when it was not placed",
				read: (value) => {
					const place = isRanking(value) ? value.order.indexOf(option.id) + 1 : 0;
					return place > 0 ? place : "";
				},
			}));
		case "grid":
			return question.rows.map((row) => ({
				...base,
				name: `${name}.${row.id}`,
				label: `${label} [${row.label}]`,
				values: optionList(question.columns),
				read: (value) => (isGrid(value) ? (value.rows[row.id] ?? "") : ""),
			}));
		case "fields":
			return question.fields.map((field) => ({
				...base,
				name: `${name}.${field.id}`,
				label: `${label} [${field.label}]`,
				values: "The text",
				read: (value) => (isFields(value) ? (value.fields[field.id] ?? "") : ""),
			}));
	}
}

/**
 * Every column of the wide export's answers, in the form's order. A repeat section gives each
 * item its own columns, item by item. Detached questions have none: their answers are not with
 * a response.
 */
export function answerColumns(definition: Definition): Column[] {
	return definition.sections.flatMap((section) => {
		if (section.type === "questions") {
			return section.questions
				.filter((question) => !question.detached)
				.flatMap((question) => columnsOf(question, question.label, ""));
		}
		const perItem = (item: Item) =>
			[...section.block.status, ...section.block.followUps].flatMap((question) =>
				columnsOf(question, mergeItem(question.label, item), item.id),
			);
		return section.groups.flatMap((group) => group.items.flatMap(perItem));
	});
}

/**
 * The columns every export begins with. Their names are the ids a question may not have
 * (`RESERVED_QUESTION_IDS` in the schema package): a test holds that the two lists are one.
 */
export const FIXED_COLUMNS = ["response", "device", "started", "completed", "active_seconds"];

const FIXED = [
	["response", "The response's id"],
	["device", "phone; tablet; desk: the rough size of the screen it was started on"],
	["started", "When it was started, in UTC"],
	["completed", "When it was completed, in UTC; empty when it was not"],
	["active_seconds", "Seconds its questions were on screen in a visible tab, added up"],
] as const;

const iso = (time: number) => new Date(time).toISOString();

/**
 * The responses as one row each, one column per thing asked. An empty cell means the question
 * was not shown to that person or was left without an answer.
 */
export function responsesCsv(definition: Definition, given: ResponseRecord[]): string {
	const records = allReached(definition, given);
	const columns = answerColumns(definition);
	const rows = records.map((record) => [
		record.id,
		record.device,
		iso(record.createdAt),
		record.completedAt === null ? "" : iso(record.completedAt),
		Math.round(activeMsOf(record) / 1000),
		...columns.map((column) => {
			const answer = column.itemId
				? record.answers.items[column.itemId]?.[column.questionId]
				: record.answers.questions[column.questionId];
			return answer?.value === null || answer?.value === undefined ? "" : column.read(answer.value);
		}),
	]);
	return toCsv([...FIXED.map(([name]) => name), ...columns.map((column) => column.name)], rows);
}

/** What each column of the wide export means: the question, the item, and the values' labels. */
export function codebookCsv(definition: Definition): string {
	return toCsv(
		["column", "question", "item", "type", "label", "values"],
		[
			...FIXED.map(([name, values]) => [name, "", "", "", "", values]),
			...answerColumns(definition).map((column) => [
				column.name,
				column.questionId,
				column.itemId,
				column.type,
				column.label,
				column.values,
			]),
		],
	);
}

/**
 * The answers a form keeps apart, one row for each time someone left any. There is no id, no
 * time and no order to them: give the rows in the order of their random keys, never in the
 * order they arrived.
 */
export function detachedCsv(questions: Question[], rows: Array<Record<string, unknown>>): string {
	const columns = questions.flatMap((question) => columnsOf(question, question.label, ""));
	return toCsv(
		columns.map((column) => column.name),
		rows.map((row) =>
			columns.map((column) => {
				const value = row[column.questionId];
				return value === null || value === undefined ? "" : column.read(value as AnswerValue);
			}),
		),
	);
}
