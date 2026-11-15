import type { Question } from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import {
	applyFilter,
	filterQuestions,
	median,
	overview,
	questionSummaries,
	repeatTables,
	signals,
	summarise,
} from "../src";
import { games, responses } from "./games";

describe("median", () => {
	it("is the middle of an odd count and the mean of the middle two of an even one", () => {
		expect(median([5, 1, 3])).toBe(3);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([7])).toBe(7);
	});

	it("is nothing for no values", () => {
		expect(median([])).toBeNull();
	});
});

describe("the overview", () => {
	const result = overview(games, responses);

	it("counts started and completed, and the share that completed", () => {
		expect(result).toMatchObject({ started: 8, completed: 4, completedShare: 0.5 });
	});

	it("gives the median active time of completed responses, by device", () => {
		// Completed: r1 19000 (desk), r2 8500 (phone), r3 4000 (phone), r4 700 (desk).
		expect(result.activeTime).toEqual([
			// 700, 4000, 8500, 19000: the middle two average 6250.
			{ device: "all", completed: 4, medianMs: 6250 },
			{ device: "phone", completed: 2, medianMs: 6250 },
			{ device: "tablet", completed: 0, medianMs: null },
			{ device: "desk", completed: 2, medianMs: 9850 },
		]);
	});

	it("says where the responses that are not complete stopped", () => {
		expect(result.stopped).toEqual([
			{ sectionId: "you", section: "You", count: 1 },
			{
				sectionId: "games",
				section: "Five games",
				groupId: "classics",
				group: "Classics",
				count: 1,
			},
			{
				sectionId: "games",
				section: "Five games",
				groupId: "modern",
				group: "Modern games",
				count: 0,
			},
			{ sectionId: "last", section: "Last thing", count: 0 },
		]);
		// r6 saved nothing; r8 only a position, which is the browser's word and not counted.
		expect(result.stoppedAtStart).toBe(2);
	});

	it("names the last question each of them answered or passed, in the form's order", () => {
		expect(result.lastQuestions).toEqual([
			{ key: "q:plays", label: "How often do you play?", count: 1 },
			{ key: "i:chess:played", label: "Have you played Chess?", count: 1 },
		]);
	});

	it("counts two responses that stopped at the same question once, with both", () => {
		const [, , , , fifth] = responses;
		if (!fifth) throw new Error("There is no fifth response");
		const twice = overview(games, [fifth, { ...fifth, id: "r5b" }]);
		expect(twice.lastQuestions).toEqual([
			{ key: "i:chess:played", label: "Have you played Chess?", count: 2 },
		]);
	});

	it("has no share and no medians when nothing was started", () => {
		const empty = overview(games, []);
		expect(empty).toMatchObject({ started: 0, completed: 0, completedShare: null });
		expect(empty.activeTime.every((row) => row.medianMs === null)).toBe(true);
	});
});

describe("a question's summary", () => {
	const [you, last] = questionSummaries(games, responses);

	it("counts each option out of those who answered", () => {
		expect(you?.questions[0]).toMatchObject({
			id: "plays",
			seen: 6,
			answered: 6,
			// 300, 500, 1000, 1000, 2000, 4000.
			medianMs: 1000,
			tally: {
				kind: "options",
				options: [
					{ id: "weekly", count: 3 },
					{ id: "monthly", count: 2 },
					{ id: "rarely", count: 1 },
				],
			},
		});
	});

	it("tells a question that was seen and left empty from one that was answered", () => {
		expect(you?.questions[1]).toMatchObject({
			id: "owned",
			seen: 4,
			answered: 3,
			// 4, 10 and 20.
			tally: { kind: "number", min: 4, max: 20, median: 10 },
		});
		const tally = you?.questions[1]?.tally;
		expect(tally?.kind === "number" && tally.mean).toBeCloseTo(34 / 3);
	});

	it("counts every option of a question that takes several, with what was written beside one", () => {
		expect(you?.questions[2]).toMatchObject({
			id: "likes",
			answered: 3,
			changes: 1,
			tally: {
				options: [
					{ id: "strategy", count: 2, texts: [] },
					{ id: "party", count: 1 },
					{ id: "coop", count: 1 },
					{ id: "other", count: 1, texts: ["Solo"] },
				],
			},
		});
	});

	it("lists what was written, and leaves the detached question out", () => {
		expect(last?.questions.map((question) => question.id)).toEqual(["note"]);
		expect(last?.questions[0]?.tally).toEqual({
			kind: "texts",
			texts: ['He said "no", twice', "=cmd()"],
		});
	});

	it("gives a ranking each option's mean place among those who placed it", () => {
		const question: Question = {
			id: "order",
			type: "ranking",
			label: "Order",
			options: [
				{ id: "a", label: "A" },
				{ id: "b", label: "B" },
				{ id: "c", label: "C" },
			],
		};
		const answer = (order: string[]) => ({ value: { order }, activeMs: 0, changes: 0 });
		const { tally } = summarise(question, "Order", [
			answer(["a", "b", "c"]),
			answer(["b", "a"]),
			answer(["a"]),
		]);
		expect(tally).toEqual({
			kind: "ranking",
			options: [
				// Places 1, 2 and 1.
				{ id: "a", label: "A", ranked: 3, first: 2, meanPlace: 4 / 3 },
				// Places 2 and 1.
				{ id: "b", label: "B", ranked: 2, first: 1, meanPlace: 1.5 },
				{ id: "c", label: "C", ranked: 1, first: 0, meanPlace: 3 },
			],
		});
	});

	it("counts a grid row by row, and a set of fields field by field", () => {
		const grid: Question = {
			id: "tools",
			type: "grid",
			label: "Tools",
			rows: [
				{ id: "dice", label: "Dice" },
				{ id: "timer", label: "Timer" },
			],
			columns: [
				{ id: "no", label: "No" },
				{ id: "yes", label: "Yes" },
			],
		};
		const rows = (value: Record<string, string>) => ({
			value: { rows: value },
			activeMs: 0,
			changes: 0,
		});
		expect(
			summarise(grid, "Tools", [rows({ dice: "yes", timer: "no" }), rows({ dice: "yes" })]).tally,
		).toEqual({
			kind: "grid",
			rows: [
				{
					id: "dice",
					label: "Dice",
					columns: [
						{ id: "no", label: "No", count: 0 },
						{ id: "yes", label: "Yes", count: 2 },
					],
				},
				{
					id: "timer",
					label: "Timer",
					columns: [
						{ id: "no", label: "No", count: 1 },
						{ id: "yes", label: "Yes", count: 0 },
					],
				},
			],
		});

		const fields: Question = {
			id: "shelf",
			type: "fields",
			label: "Shelf",
			fields: [
				{ id: "top", label: "Top" },
				{ id: "bottom", label: "Bottom" },
			],
		};
		const filled = (value: Record<string, string>) => ({
			value: { fields: value },
			activeMs: 0,
			changes: 0,
		});
		expect(
			summarise(fields, "Shelf", [filled({ top: "Chess" }), filled({ top: "Go", bottom: "Dice" })])
				.tally,
		).toEqual({
			kind: "fields",
			fields: [
				{ id: "top", label: "Top", texts: ["Chess", "Go"] },
				{ id: "bottom", label: "Bottom", texts: ["Dice"] },
			],
		});
	});
});

describe("a repeat section's table", () => {
	const [table] = repeatTables(games, responses);
	const item = (id: string) =>
		table?.groups.flatMap((group) => group.items).find((candidate) => candidate.id === id);
	const counts = (id: string) => {
		const tally = item(id)?.status[0]?.tally;
		return tally?.kind === "options" ? tally.options.map((option) => option.count) : [];
	};

	it("names the status questions its columns belong to, without an item's name", () => {
		expect(table?.status).toEqual([{ id: "played", label: "Have you played …?" }]);
	});

	it("has every item in its group, in the form's order", () => {
		expect(table?.groups.map((group) => [group.title, group.items.map(({ id }) => id)])).toEqual([
			["Classics", ["chess", "go", "draughts"]],
			["Modern games", ["catan", "carcassonne"]],
		]);
	});

	it("counts each status for each item: never, once, often", () => {
		expect(counts("chess")).toEqual([3, 1, 1]);
		expect(counts("go")).toEqual([3, 0, 1]);
		expect(counts("draughts")).toEqual([2, 1, 1]);
		expect(counts("catan")).toEqual([1, 1, 1]);
		expect(counts("carcassonne")).toEqual([2, 0, 1]);
		expect(item("chess")?.status[0]).toMatchObject({ seen: 5, answered: 5 });
		expect(item("catan")?.status[0]).toMatchObject({ seen: 3, answered: 3 });
	});

	it("gives each item its follow-ups, worded for the item", () => {
		expect(item("carcassonne")?.followUps[0]).toMatchObject({
			label: "Why have you never played Carcassonne?",
			seen: 1,
			answered: 1,
			tally: { kind: "texts", texts: ["Too long"] },
		});
		// Seen once and left empty.
		expect(item("go")?.followUps[0]).toMatchObject({ seen: 1, answered: 0 });
		expect(item("catan")?.followUps[0]).toMatchObject({ seen: 0, answered: 0, medianMs: null });
	});
});

describe("the signals", () => {
	const result = signals(games, responses);
	const of = (id: string) => result.responses.find((response) => response.id === id);

	it("marks a completed response under 30% of the median active time as fast", () => {
		expect(result.medianMs).toBe(6250);
		// 30% of 6250 is 1875: only r4, at 700, is under it.
		expect(result.responses.filter((response) => response.fast).map(({ id }) => id)).toEqual([
			"r4",
		]);
		expect(of("r3")).toMatchObject({ activeMs: 4000, fast: false });
	});

	it("does not call a response that is not complete fast", () => {
		expect(of("r6")).toMatchObject({ activeMs: 0, fast: false });
	});

	it("names the groups where three or more items got the same status", () => {
		expect(of("r1")?.straight).toEqual(["Classics"]);
		// All five the same, but the modern group has two items, which says nothing.
		expect(of("r3")?.straight).toEqual(["Classics"]);
		expect(of("r4")?.straight).toEqual(["Classics"]);
		expect(of("r2")?.straight).toEqual([]);
		expect(of("r5")?.straight).toEqual([]);
	});

	it("adds up how often answers were changed", () => {
		expect(of("r1")?.changes).toBe(1);
		expect(of("r2")?.changes).toBe(0);
	});
});

describe("a filter", () => {
	it("can be about a question with one answer out of a few, asked once", () => {
		expect(filterQuestions(games).map((question) => question.id)).toEqual(["plays"]);
	});

	it("keeps the responses from one kind of device", () => {
		const kept = applyFilter(games, responses, { device: "phone" });
		expect(kept.map(({ id }) => id)).toEqual(["r2", "r3", "r6"]);
		expect(overview(games, kept)).toMatchObject({ started: 3, completed: 2 });
	});

	it("keeps the responses that gave one answer", () => {
		const kept = applyFilter(games, responses, { question: "plays", option: "weekly" });
		expect(kept.map(({ id }) => id)).toEqual(["r1", "r3", "r5"]);
	});

	it("can do both, and keeps everything when it names a question that cannot filter", () => {
		expect(
			applyFilter(games, responses, { device: "desk", question: "plays", option: "weekly" }).map(
				({ id }) => id,
			),
		).toEqual(["r1"]);
		expect(applyFilter(games, responses, { question: "likes", option: "party" })).toHaveLength(8);
	});
});
