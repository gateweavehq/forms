import { type AnswerValue, answerValueSchema, type Question } from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import { type Draft, fromDraft, isEmptyDraft, toDraft } from "./draft";

const empty = toDraft(null);

function draft(parts: Partial<Draft>): Draft {
	return { ...empty, ...parts };
}

const choice: Question = {
	id: "bakes",
	type: "single_choice",
	label: "Do you bake?",
	options: [
		{ id: "yes", label: "Yes" },
		{ id: "other", label: "Something else", specify: true },
	],
};

const several: Question = {
	id: "why",
	type: "multiple_choice",
	label: "Why?",
	max: 2,
	options: [
		{ id: "taste", label: "Taste" },
		{ id: "cost", label: "Cost" },
		{ id: "other", label: "Something else", specify: true },
	],
};

const years: Question = { id: "years", type: "number", label: "Years?", min: 0, max: 90 };

describe("what the inputs hold, as an answer", () => {
	it("is nothing for an empty or blank text", () => {
		const text: Question = { id: "note", type: "short_text", label: "A note" };
		expect(fromDraft(text, empty)).toEqual({ ok: true, value: null });
		expect(fromDraft(text, draft({ text: "   " }))).toEqual({ ok: true, value: null });
		expect(fromDraft(text, draft({ text: " rye " }))).toEqual({ ok: true, value: "rye" });
	});

	it("reads a number typed with a point or a comma", () => {
		expect(fromDraft(years, draft({ text: "0.5" }))).toEqual({ ok: true, value: 0.5 });
		expect(fromDraft(years, draft({ text: "0,5" }))).toEqual({ ok: true, value: 0.5 });
		expect(fromDraft(years, draft({ text: " 12 " }))).toEqual({ ok: true, value: 12 });
	});

	it("says what is wrong with a number, in words", () => {
		expect(fromDraft(years, draft({ text: "a few" }))).toEqual({
			ok: false,
			problem: "Enter a number, or leave it empty.",
		});
		expect(fromDraft(years, draft({ text: "-1" }))).toEqual({
			ok: false,
			problem: "Enter 0 or more.",
		});
		expect(fromDraft(years, draft({ text: "200" }))).toEqual({
			ok: false,
			problem: "Enter 90 or less.",
		});
		expect(fromDraft({ ...years, integer: true }, draft({ text: "1.5" }))).toEqual({
			ok: false,
			problem: "Enter a whole number.",
		});
	});

	it("checks that an email address looks like one", () => {
		const email: Question = { id: "email", type: "email", label: "Email" };
		expect(fromDraft(email, draft({ text: "someone@example.test" }))).toEqual({
			ok: true,
			value: "someone@example.test",
		});
		expect(fromDraft(email, draft({ text: "someone" })).ok).toBe(false);
		// What the server refuses, the page refuses too: an address the page let through and
		// the server did not would be lost without a word.
		for (const text of ["someone@example.c", "someone@example", "some one@example.test"]) {
			expect(fromDraft(email, draft({ text })), text).toEqual({
				ok: false,
				problem: "Enter an email address, or leave it empty.",
			});
			expect(answerValueSchema(email).safeParse(text).success, text).toBe(false);
		}
		expect(fromDraft(email, empty)).toEqual({ ok: true, value: null });
	});

	it("keeps an option's line of text only while that option is chosen", () => {
		const typed = { other: " A hobby " };
		expect(fromDraft(choice, draft({ option: "other", texts: typed }))).toEqual({
			ok: true,
			value: { option: "other", text: "A hobby" },
		});
		expect(fromDraft(choice, draft({ option: "yes", texts: typed }))).toEqual({
			ok: true,
			value: { option: "yes" },
		});
		expect(fromDraft(choice, draft({ option: "nope" }))).toEqual({ ok: true, value: null });
	});

	it("puts chosen options in the question's order, whatever order they were ticked in", () => {
		expect(fromDraft(several, draft({ options: ["cost", "taste"] }))).toEqual({
			ok: true,
			value: { options: ["taste", "cost"] },
		});
		expect(fromDraft(several, draft({ options: ["other"], texts: { other: "Fun" } }))).toEqual({
			ok: true,
			value: { options: ["other"], texts: { other: "Fun" } },
		});
		expect(fromDraft(several, empty)).toEqual({ ok: true, value: null });
	});

	it("keeps a ranking in the order it was picked", () => {
		const ranking: Question = {
			id: "rank",
			type: "ranking",
			label: "Order these",
			options: [
				{ id: "crust", label: "Crust" },
				{ id: "crumb", label: "Crumb" },
			],
		};
		expect(fromDraft(ranking, draft({ options: ["crumb", "crust"] }))).toEqual({
			ok: true,
			value: { order: ["crumb", "crust"] },
		});
	});

	it("keeps the answered rows of a grid and the filled fields of a question", () => {
		const grid: Question = {
			id: "tools",
			type: "grid",
			label: "How often?",
			rows: [
				{ id: "scale", label: "Scale" },
				{ id: "pot", label: "Pot" },
			],
			columns: [
				{ id: "never", label: "Never" },
				{ id: "always", label: "Always" },
			],
		};
		expect(fromDraft(grid, draft({ rows: { scale: "always", pot: "sometimes" } }))).toEqual({
			ok: true,
			value: { rows: { scale: "always" } },
		});
		const fields: Question = {
			id: "flours",
			type: "fields",
			label: "Flours",
			fields: [
				{ id: "wheat", label: "Wheat" },
				{ id: "rye", label: "Rye" },
			],
		};
		expect(fromDraft(fields, draft({ rows: { wheat: " strong white ", rye: " " } }))).toEqual({
			ok: true,
			value: { fields: { wheat: "strong white" } },
		});
	});

	it("asks for an answer to a required question", () => {
		expect(fromDraft({ ...choice, required: true }, empty)).toEqual({
			ok: false,
			problem: "This question needs an answer.",
		});
	});

	it("knows when there is nothing to store, required or not", () => {
		expect(isEmptyDraft({ ...choice, required: true }, empty)).toBe(true);
		expect(isEmptyDraft(choice, draft({ option: "yes" }))).toBe(false);
		expect(isEmptyDraft(years, draft({ text: "x" }))).toBe(false);
	});
});

describe("a stored answer, shown again", () => {
	const cases: Array<[Question, AnswerValue]> = [
		[choice, { option: "other", text: "A hobby" }],
		[several, { options: ["taste", "other"], texts: { other: "Fun" } }],
		[years, 12.5],
		[{ id: "note", type: "long_text", label: "A note" }, "Two\nlines"],
	];

	it("comes back as the same answer", () => {
		for (const [question, value] of cases) {
			expect(fromDraft(question, toDraft(value))).toEqual({ ok: true, value });
		}
	});
});
