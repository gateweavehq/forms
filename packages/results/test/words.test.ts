import type { Question } from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import { inWords, responseLines } from "../src";
import { games, responses } from "./games";

describe("an answer in words", () => {
	it("uses the labels people read, not the ids that are stored", () => {
		const likes = games.sections[0]?.type === "questions" ? games.sections[0].questions[2] : null;
		if (!likes) throw new Error("The form has no such question");
		expect(inWords(likes, { options: ["strategy", "other"], texts: { other: "Solo" } })).toBe(
			"Strategy; Something else: Solo",
		);
	});

	it("writes a ranking in its order, and a grid row by row", () => {
		const ranking: Question = {
			id: "order",
			type: "ranking",
			label: "Order",
			options: [
				{ id: "a", label: "First thing" },
				{ id: "b", label: "Second thing" },
			],
		};
		expect(inWords(ranking, { order: ["b", "a"] })).toBe("1. Second thing; 2. First thing");
		const grid: Question = {
			id: "tools",
			type: "grid",
			label: "Tools",
			rows: [{ id: "dice", label: "Dice" }],
			columns: [
				{ id: "no", label: "No" },
				{ id: "yes", label: "Yes" },
			],
		};
		expect(inWords(grid, { rows: { dice: "yes" } })).toBe("Dice: Yes");
	});
});

describe("one response, question by question", () => {
	it("has every question it was shown, in the form's order, worded for its item", () => {
		const [, second] = responses;
		if (!second) throw new Error("There is no second response");
		const sections = responseLines(games, second);
		expect(sections.map((section) => section.title)).toEqual([
			"You",
			"Five games: Classics",
			"Five games: Modern games",
			"Last thing",
		]);
		expect(sections[1]?.lines).toEqual([
			{ label: "Have you played Chess?", answer: "Never", activeMs: 500, changes: 0 },
			{
				label: "Why have you never played Chess?",
				answer: "No board",
				activeMs: 1500,
				changes: 0,
			},
			{ label: "Have you played Go?", answer: "Never", activeMs: 500, changes: 0 },
			// Shown and left empty.
			{ label: "Why have you never played Go?", answer: null, activeMs: 500, changes: 0 },
			{ label: "Have you played Draughts?", answer: "Once or twice", activeMs: 500, changes: 0 },
		]);
	});

	it("leaves out the sections a response never reached", () => {
		const [, , , , fifth] = responses;
		if (!fifth) throw new Error("There is no fifth response");
		expect(responseLines(games, fifth).map((section) => section.title)).toEqual([
			"You",
			"Five games: Classics",
		]);
	});
});
