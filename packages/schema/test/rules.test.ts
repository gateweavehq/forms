import { describe, expect, it } from "vitest";
import { type AnswerValue, type Condition, holds, referencedQuestions } from "../src";

function check(condition: Condition, answers: Record<string, AnswerValue>): boolean {
	return holds(condition, (question) => answers[question]);
}

describe("a condition", () => {
	it("is: the chosen option, a text or a number", () => {
		expect(check({ question: "q", is: "a" }, { q: { option: "a" } })).toBe(true);
		expect(check({ question: "q", is: "a" }, { q: { option: "b" } })).toBe(false);
		expect(check({ question: "q", is: "tea" }, { q: "tea" })).toBe(true);
		expect(check({ question: "q", is: 3 }, { q: 3 })).toBe(true);
		expect(check({ question: "q", is: "3" }, { q: 3 })).toBe(false);
	});

	it("is: false without an answer", () => {
		expect(check({ question: "q", is: "a" }, {})).toBe(false);
	});

	it("is, with a row: that row of a grid", () => {
		const grid = { rows: { morning: "yes", evening: "no" } };
		expect(check({ question: "q", row: "morning", is: "yes" }, { q: grid })).toBe(true);
		expect(check({ question: "q", row: "evening", is: "yes" }, { q: grid })).toBe(false);
		expect(check({ question: "q", row: "noon", is: "yes" }, { q: grid })).toBe(false);
	});

	it("isNot: anything else, a missing answer included", () => {
		expect(check({ question: "q", isNot: "a" }, { q: { option: "b" } })).toBe(true);
		expect(check({ question: "q", isNot: "a" }, { q: { option: "a" } })).toBe(false);
		expect(check({ question: "q", isNot: "a" }, {})).toBe(true);
	});

	it("includes: one of the chosen options, or of a ranking", () => {
		expect(check({ question: "q", includes: "b" }, { q: { options: ["a", "b"] } })).toBe(true);
		expect(check({ question: "q", includes: "c" }, { q: { options: ["a", "b"] } })).toBe(false);
		expect(check({ question: "q", includes: "b" }, { q: { order: ["b"] } })).toBe(true);
		expect(check({ question: "q", includes: "b" }, {})).toBe(false);
	});

	it("answered: whether there is an answer that says something", () => {
		expect(check({ question: "q", answered: true }, { q: "a@example.test" })).toBe(true);
		expect(check({ question: "q", answered: true }, { q: "  " })).toBe(false);
		expect(check({ question: "q", answered: true }, { q: { options: [] } })).toBe(false);
		expect(check({ question: "q", answered: false }, {})).toBe(true);
		expect(check({ question: "q", answered: true }, { q: 0 })).toBe(true);
	});

	it("all, any and not combine", () => {
		const answers = { a: { option: "x" }, b: { options: ["y"] } };
		const a: Condition = { question: "a", is: "x" };
		const b: Condition = { question: "b", includes: "z" };
		expect(check({ all: [a, b] }, answers)).toBe(false);
		expect(check({ any: [a, b] }, answers)).toBe(true);
		expect(check({ not: b }, answers)).toBe(true);
		expect(check({ all: [a, { not: b }] }, answers)).toBe(true);
	});

	it("knows which questions it looks at", () => {
		const condition: Condition = {
			any: [{ question: "a", is: "x" }, { not: { all: [{ question: "b", answered: true }] } }],
		};
		expect(referencedQuestions(condition)).toEqual(["a", "b"]);
	});
});
