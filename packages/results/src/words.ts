import {
	type AnswerValue,
	type Definition,
	isAnswered,
	isChoice,
	isChoices,
	isFields,
	isGrid,
	isRanking,
	mergeItem,
	type Question,
} from "@gateweave/forms-schema";
import type { ResponseRecord } from "./records";

/** An answer as a person would read it: labels instead of ids. */
export function inWords(question: Question, value: AnswerValue): string {
	const labelOf = (list: Array<{ id: string; label: string }>, id: string) =>
		list.find((entry) => entry.id === id)?.label ?? id;
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (isChoice(value)) {
		const label = "options" in question ? labelOf(question.options, value.option) : value.option;
		return value.text ? `${label}: ${value.text}` : label;
	}
	if (isChoices(value)) {
		return value.options
			.map((id) => {
				const label = "options" in question ? labelOf(question.options, id) : id;
				const text = value.texts?.[id];
				return text ? `${label}: ${text}` : label;
			})
			.join("; ");
	}
	if (isRanking(value)) {
		return value.order
			.map(
				(id, index) =>
					`${index + 1}. ${"options" in question ? labelOf(question.options, id) : id}`,
			)
			.join("; ");
	}
	if (isGrid(value)) {
		return Object.entries(value.rows)
			.map(([row, column]) =>
				question.type === "grid"
					? `${labelOf(question.rows, row)}: ${labelOf(question.columns, column)}`
					: `${row}: ${column}`,
			)
			.join("; ");
	}
	if (isFields(value)) {
		return Object.entries(value.fields)
			.map(
				([field, text]) =>
					`${question.type === "fields" ? labelOf(question.fields, field) : field}: ${text}`,
			)
			.join("; ");
	}
	return "";
}

/** One question of a response as it was answered. */
export interface AnswerLine {
	/** The question's wording, for an item's question with the item's name filled in. */
	label: string;
	/** The answer in words, or nothing when the question was shown and left empty. */
	answer: string | null;
	activeMs: number;
	changes: number;
}

export interface ResponseSection {
	title: string;
	lines: AnswerLine[];
}

/**
 * One response, question by question in the form's order: every question it was shown, with
 * what it answered. Detached answers are not part of a response and cannot appear.
 */
export function responseLines(definition: Definition, record: ResponseRecord): ResponseSection[] {
	const line = (
		question: Question,
		label: string,
		answer: ResponseRecord["answers"]["questions"][string] | undefined,
	): AnswerLine[] =>
		answer
			? [
					{
						label,
						answer: isAnswered(answer.value) ? inWords(question, answer.value) : null,
						activeMs: answer.activeMs,
						changes: answer.changes,
					},
				]
			: [];
	return definition.sections.flatMap((section) => {
		if (section.type === "questions") {
			const lines = section.questions.flatMap((question) =>
				line(question, question.label, record.answers.questions[question.id]),
			);
			return lines.length > 0 ? [{ title: section.title, lines }] : [];
		}
		return section.groups.flatMap((group) => {
			const lines = group.items.flatMap((item) =>
				[...section.block.status, ...section.block.followUps].flatMap((question) =>
					line(
						question,
						mergeItem(question.label, item),
						record.answers.items[item.id]?.[question.id],
					),
				),
			);
			return lines.length > 0 ? [{ title: `${section.title}: ${group.title}`, lines }] : [];
		});
	});
}
