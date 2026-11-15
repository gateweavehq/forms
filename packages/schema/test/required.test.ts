import { describe, expect, it } from "vitest";
import {
	type AnswerValue,
	emptyAnswers,
	missingFrom,
	needsAnswer,
	type Question,
	unansweredRequired,
	withAnswer,
} from "../src";
import { questionsSection, teaForm, valid } from "./forms";

const grid: Question = {
	id: "times",
	type: "grid",
	label: "When do you drink it?",
	required: true,
	rows: [
		{ id: "morning", label: "Morning" },
		{ id: "noon", label: "Noon" },
		{ id: "evening", label: "Evening" },
	],
	columns: [
		{ id: "yes", label: "Yes" },
		{ id: "no", label: "No" },
	],
};

const fields: Question = {
	id: "cupboard",
	type: "fields",
	label: "What is in your cupboard?",
	fields: [
		{ id: "black", label: "Black" },
		{ id: "green", label: "Green", required: true },
		{ id: "other", label: "Other" },
	],
};

const ranking: Question = {
	id: "order",
	type: "ranking",
	label: "Put these in order",
	required: true,
	options: [
		{ id: "taste", label: "Taste" },
		{ id: "price", label: "Price" },
		{ id: "origin", label: "Origin" },
	],
};

describe("a required question", () => {
	it("is whole only when every row of a grid has its choice", () => {
		expect(missingFrom(grid, null)).toEqual({ kind: "answer" });
		expect(missingFrom(grid, { rows: { morning: "yes" } })).toEqual({
			kind: "rows",
			rows: ["noon", "evening"],
		});
		expect(
			missingFrom(grid, { rows: { morning: "yes", noon: "no", evening: "no" } }),
		).toBeUndefined();
	});

	it("is whole only when a ranking orders every option", () => {
		expect(missingFrom(ranking, { order: ["price"] })).toEqual({
			kind: "ranking",
			ranked: 1,
			of: 3,
		});
		expect(missingFrom(ranking, { order: ["price", "taste", "origin"] })).toBeUndefined();
	});

	it("asks of a question with fields the fields that are marked, and only those", () => {
		expect(needsAnswer(fields)).toBe(true);
		expect(missingFrom(fields, null)).toEqual({ kind: "fields", fields: ["green"] });
		// Another field filled does not stand in for the one that is required.
		expect(missingFrom(fields, { fields: { black: "Assam" } })).toEqual({
			kind: "fields",
			fields: ["green"],
		});
		expect(missingFrom(fields, { fields: { green: "  " } })).toEqual({
			kind: "fields",
			fields: ["green"],
		});
		expect(missingFrom(fields, { fields: { green: "Sencha" } })).toBeUndefined();
	});

	it("asks for every field when the question itself is required", () => {
		const all: Question = { ...fields, required: true };
		expect(missingFrom(all, { fields: { green: "Sencha" } })).toEqual({
			kind: "fields",
			fields: ["black", "other"],
		});
	});

	it("is not asked of a question that may be passed, however little it holds", () => {
		const optional: Question = { ...grid, required: false };
		expect(needsAnswer(optional)).toBe(false);
		expect(missingFrom(optional, { rows: { morning: "yes" } })).toBeUndefined();
		expect(missingFrom(optional, null)).toBeUndefined();
	});

	it("keeps a response from being completed until it is whole", () => {
		const form = teaForm();
		questionsSection(form, "last").questions.unshift(grid, fields, ranking);
		const definition = valid(form);
		const keys = (values: Record<string, AnswerValue>) => {
			let answers = emptyAnswers();
			for (const [question, value] of Object.entries(values)) {
				answers = withAnswer(answers, question, undefined, { value, activeMs: 0, changes: 0 });
			}
			return unansweredRequired(definition, answers).map((step) => step.key);
		};
		expect(keys({})).toEqual(["q:times", "q:cupboard", "q:order"]);
		expect(
			keys({
				times: { rows: { morning: "yes" } },
				cupboard: { fields: { black: "Assam" } },
				order: { order: ["taste", "price"] },
			}),
		).toEqual(["q:times", "q:cupboard", "q:order"]);
		expect(
			keys({
				times: { rows: { morning: "yes", noon: "yes", evening: "no" } },
				cupboard: { fields: { green: "Sencha" } },
				order: { order: ["taste", "price", "origin"] },
			}),
		).toEqual([]);
	});
});
