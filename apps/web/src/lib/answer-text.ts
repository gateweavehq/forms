import {
	type AnswerValue,
	type Item,
	isAnswered,
	isChoice,
	isChoices,
	isFields,
	isGrid,
	isRanking,
	mergeItem,
	type Question,
} from "@gateweave/forms-schema";

/**
 * An answer in the words the person saw when they gave it: the option's label, not its id. For
 * showing people their own answers back. Nothing when the question has no answer.
 */
export function answerText(
	question: Question,
	value: AnswerValue | null | undefined,
	item?: Item,
): string | undefined {
	if (!isAnswered(value)) return undefined;
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);

	const optionLabel = (id: string): string => {
		const option =
			"options" in question ? question.options.find((one) => one.id === id) : undefined;
		if (!option) return id;
		return item ? mergeItem(option.label, item) : option.label;
	};
	const withText = (label: string, text: string | undefined) =>
		text?.trim() ? `${label}: ${text.trim()}` : label;

	if (isChoice(value)) return withText(optionLabel(value.option), value.text);
	if (isChoices(value)) {
		return value.options.map((id) => withText(optionLabel(id), value.texts?.[id])).join(", ");
	}
	if (isRanking(value)) {
		return value.order.map((id, index) => `${index + 1}. ${optionLabel(id)}`).join(", ");
	}
	if (isGrid(value)) {
		if (question.type !== "grid") return undefined;
		return question.rows
			.filter((row) => value.rows[row.id] !== undefined)
			.map((row) => {
				const column = question.columns.find((one) => one.id === value.rows[row.id]);
				return `${row.label}: ${column?.label ?? value.rows[row.id]}`;
			})
			.join("; ");
	}
	if (isFields(value)) {
		if (question.type !== "fields") return undefined;
		return question.fields
			.filter((field) => value.fields[field.id]?.trim())
			.map((field) => `${field.label}: ${value.fields[field.id]?.trim()}`)
			.join("; ");
	}
	return undefined;
}
