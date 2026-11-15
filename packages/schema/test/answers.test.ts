import { describe, expect, it } from "vitest";
import {
	answerValueSchema,
	emptyAnswers,
	getAnswer,
	mergeCount,
	mergeItem,
	placesOf,
	plainText,
	type Question,
	responseAnswersSchema,
	withAnswer,
} from "../src";
import { teaForm, valid } from "./forms";

const definition = valid(teaForm());
const places = placesOf(definition);

function accepts(question: Question, value: unknown): boolean {
	return answerValueSchema(question).safeParse(value).success;
}

function question(id: string): Question {
	const place = places.questions.get(id);
	if (!place) throw new Error(`No question "${id}"`);
	return place.question;
}

describe("an answer's value", () => {
	it("single choice: one of the question's options", () => {
		expect(accepts(question("drinks"), { option: "yes" })).toBe(true);
		expect(accepts(question("drinks"), { option: "maybe" })).toBe(false);
		expect(accepts(question("drinks"), "yes")).toBe(false);
		expect(accepts(question("drinks"), { option: "yes", extra: 1 })).toBe(false);
	});

	it("a text only for the option that asks for one", () => {
		expect(accepts(question("drinks"), { option: "yes", text: "a lot" })).toBe(false);
		const additions = question("additions");
		expect(accepts(additions, { options: ["other"], texts: { other: "Honey" } })).toBe(true);
		expect(accepts(additions, { options: ["milk"], texts: { milk: "Oat" } })).toBe(false);
		expect(accepts(additions, { options: ["milk"], texts: { other: "Honey" } })).toBe(false);
	});

	it("multiple choice: known options, each once, within the maximum", () => {
		const additions = question("additions");
		expect(accepts(additions, { options: ["milk", "sugar"] })).toBe(true);
		expect(accepts(additions, { options: ["milk", "sugar", "lemon"] })).toBe(false);
		expect(accepts(additions, { options: ["milk", "milk"] })).toBe(false);
		expect(accepts(additions, { options: ["cream"] })).toBe(false);
		expect(accepts(additions, { options: [] })).toBe(false);
	});

	it("number: within the question's limits", () => {
		expect(accepts(question("cups"), 3)).toBe(true);
		expect(accepts(question("cups"), 0.5)).toBe(true);
		expect(accepts(question("cups"), -1)).toBe(false);
		expect(accepts(question("cups"), "3")).toBe(false);
		expect(accepts(question("cups"), Number.NaN)).toBe(false);
		expect(accepts({ ...question("cups"), integer: true } as Question, 0.5)).toBe(false);
	});

	it("text and email: not empty, not endless, and an address for an email", () => {
		expect(accepts(question("comments"), "More green teas, please.")).toBe(true);
		expect(accepts(question("comments"), "")).toBe(false);
		expect(accepts(question("comments"), "x".repeat(10_001))).toBe(false);
		expect(accepts(question("email"), "someone@example.test")).toBe(true);
		expect(accepts(question("email"), "someone")).toBe(false);
	});

	it("ranking, grid and fields: only the question's own ids", () => {
		const ranking: Question = {
			id: "rank",
			type: "ranking",
			label: "Order these",
			options: [
				{ id: "a", label: "A" },
				{ id: "b", label: "B" },
			],
		};
		expect(accepts(ranking, { order: ["b", "a"] })).toBe(true);
		expect(accepts(ranking, { order: ["b"] })).toBe(true);
		expect(accepts(ranking, { order: ["b", "b"] })).toBe(false);
		expect(accepts(ranking, { order: ["c"] })).toBe(false);

		const grid: Question = {
			id: "grid",
			type: "grid",
			label: "When?",
			rows: [{ id: "morning", label: "Morning" }],
			columns: [
				{ id: "yes", label: "Yes" },
				{ id: "no", label: "No" },
			],
		};
		expect(accepts(grid, { rows: { morning: "yes" } })).toBe(true);
		expect(accepts(grid, { rows: { noon: "yes" } })).toBe(false);
		expect(accepts(grid, { rows: { morning: "often" } })).toBe(false);
		expect(accepts(grid, { rows: {} })).toBe(false);

		const fields: Question = {
			id: "fields",
			type: "fields",
			label: "Your teas",
			fields: [{ id: "first", label: "First" }],
		};
		expect(accepts(fields, { fields: { first: "Assam" } })).toBe(true);
		expect(accepts(fields, { fields: { second: "Sencha" } })).toBe(false);
		expect(accepts(fields, { fields: {} })).toBe(false);
	});
});

describe("a response's answers", () => {
	it("are plain data keyed by question, and by item first inside a block", () => {
		let answers = emptyAnswers();
		answers = withAnswer(answers, "drinks", undefined, {
			value: { option: "yes" },
			activeMs: 1200,
			changes: 0,
		});
		answers = withAnswer(answers, "tried", "assam", {
			value: { option: "drink" },
			activeMs: 800,
			changes: 1,
		});
		answers = withAnswer(answers, "tried", "sencha", { value: null, activeMs: 300, changes: 0 });
		expect(answers).toEqual({
			version: 1,
			questions: { drinks: { value: { option: "yes" }, activeMs: 1200, changes: 0 } },
			items: {
				assam: { tried: { value: { option: "drink" }, activeMs: 800, changes: 1 } },
				sencha: { tried: { value: null, activeMs: 300, changes: 0 } },
			},
		});
		expect(responseAnswersSchema.safeParse(answers).success).toBe(true);
		expect(getAnswer(answers, "tried", "assam")?.changes).toBe(1);
		expect(getAnswer(answers, "tried")).toBeUndefined();
	});

	it("refuse another version, and timings that cannot be", () => {
		expect(responseAnswersSchema.safeParse({ version: 2, questions: {}, items: {} }).success).toBe(
			false,
		);
		const negative = {
			version: 1,
			questions: { q: { value: 1, activeMs: -5, changes: 0 } },
			items: {},
		};
		expect(responseAnswersSchema.safeParse(negative).success).toBe(false);
	});
});

describe("wording", () => {
	it("puts the item's label or name into a block's question", () => {
		const earlGrey = places.items.get("earl-grey")?.item;
		const assam = places.items.get("assam")?.item;
		if (!earlGrey || !assam) throw new Error("The form has lost its items");
		expect(mergeItem("Have you tried {{item.name}}?", earlGrey)).toBe("Have you tried Earl Grey?");
		expect(mergeItem("About {{ item.label }}", earlGrey)).toBe("About B2: Earl Grey");
		// The label stands in when an item has no name of its own.
		expect(mergeItem("Have you tried {{item.name}}?", assam)).toBe("Have you tried Assam?");
	});

	it("leaves a field it does not know as written, so the mistake shows", () => {
		expect(mergeItem("About {{item.price}}", { label: "Assam" })).toBe("About {{item.price}}");
	});

	it("puts the count into a follow-ups introduction", () => {
		expect(mergeCount("You gave up {{count}} of these.", 2)).toBe("You gave up 2 of these.");
	});

	it("reads rich text as plain words", () => {
		expect(plainText(["One.", [{ text: "Two", bold: true }, { text: " and three." }]])).toBe(
			"One.\nTwo and three.",
		);
	});
});
