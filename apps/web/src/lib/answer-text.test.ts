import type { Item, Question } from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import { answerText } from "./answer-text";

const options = [
	{ id: "a", label: "Apples" },
	{ id: "b", label: "Bread made of {{item.name}}" },
	{ id: "other", label: "Something else", specify: true },
];
const item: Item = { id: "rye", label: "R1: Rye", name: "rye" };

describe("an answer in the person's words", () => {
	it("is nothing for a question without an answer", () => {
		const question: Question = { id: "q", type: "short_text", label: "Q" };
		expect(answerText(question, undefined)).toBeUndefined();
		expect(answerText(question, null)).toBeUndefined();
		expect(answerText(question, "  ")).toBeUndefined();
	});

	it("is the text or the number as given", () => {
		expect(answerText({ id: "q", type: "long_text", label: "Q" }, " Two\nlines ")).toBe(
			"Two\nlines",
		);
		expect(answerText({ id: "q", type: "number", label: "Q" }, 3.5)).toBe("3.5");
	});

	it("is the option's label, with the item's name merged and the line it asked for", () => {
		const question: Question = { id: "q", type: "single_choice", label: "Q", options };
		expect(answerText(question, { option: "a" })).toBe("Apples");
		expect(answerText(question, { option: "b" }, item)).toBe("Bread made of rye");
		expect(answerText(question, { option: "other", text: "Pears" })).toBe("Something else: Pears");
		// An option the form no longer has is shown as it was stored, not dropped.
		expect(answerText(question, { option: "gone" })).toBe("gone");
	});

	it("lists several choices, and a ranking in its order", () => {
		const many: Question = { id: "q", type: "multiple_choice", label: "Q", options };
		expect(answerText(many, { options: ["a", "other"], texts: { other: "Pears" } })).toBe(
			"Apples, Something else: Pears",
		);
		const ranking: Question = { id: "q", type: "ranking", label: "Q", options };
		expect(answerText(ranking, { order: ["other", "a"] })).toBe("1. Something else, 2. Apples");
	});

	it("names each answered row of a grid and each filled field", () => {
		const grid: Question = {
			id: "q",
			type: "grid",
			label: "Q",
			rows: [
				{ id: "r1", label: "Scale" },
				{ id: "r2", label: "Pot" },
			],
			columns: [
				{ id: "no", label: "Never" },
				{ id: "yes", label: "Always" },
			],
		};
		expect(answerText(grid, { rows: { r2: "yes" } })).toBe("Pot: Always");
		const fields: Question = {
			id: "q",
			type: "fields",
			label: "Q",
			fields: [
				{ id: "f1", label: "Wheat" },
				{ id: "f2", label: "Rye" },
			],
		};
		expect(answerText(fields, { fields: { f1: "Strong white", f2: " " } })).toBe(
			"Wheat: Strong white",
		);
	});
});
