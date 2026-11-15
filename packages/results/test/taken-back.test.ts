import { emptyAnswers, withAnswer } from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import {
	activeMsOf,
	overview,
	type ResponseRecord,
	reached,
	repeatTables,
	responseLines,
	responsesCsv,
	signals,
} from "../src";
import { games } from "./games";

/**
 * Someone said they had never played chess and typed why; then went back and said they play it
 * often, and left without finishing. "Why have you never played it?" is no longer a question
 * they were asked. Its answer is still in what the server handed over, as a row that escaped
 * removal would be.
 */
function changedTheirMind(): ResponseRecord {
	let answers = emptyAnswers();
	const give = (question: string, value: string | { option: string }, item?: string) => {
		answers = withAnswer(answers, question, item, { value, activeMs: 1000, changes: 0 });
	};
	give("plays", { option: "weekly" });
	give("played", { option: "often" }, "chess");
	give("why-not", "Nobody to play with", "chess");
	// Still asked: go was never played.
	give("played", { option: "never" }, "go");
	give("why-not", "Too hard", "go");
	return {
		id: "changed",
		device: "desk",
		createdAt: Date.UTC(2026, 0, 1),
		completedAt: null,
		position: null,
		answers,
	};
}

describe("an answer that was taken back", () => {
	const record = changedTheirMind();
	const chess = () =>
		repeatTables(games, [record])[0]
			?.groups.flatMap((group) => group.items)
			.find((item) => item.id === "chess");

	it("is not in the response as the results read it, and the rest is", () => {
		const read = reached(games, record);
		expect(read.answers.items.chess).toEqual({
			played: { value: { option: "often" }, activeMs: 1000, changes: 0 },
		});
		expect(Object.keys(read.answers.items.go ?? {}).sort()).toEqual(["played", "why-not"]);
		// What was handed in is left as it was.
		expect(record.answers.items.chess?.["why-not"]?.value).toBe("Nobody to play with");
	});

	it("is not counted under its item", () => {
		expect(chess()?.followUps[0]).toMatchObject({ seen: 0, answered: 0 });
		expect(JSON.stringify(repeatTables(games, [record]))).not.toContain("Nobody to play with");
		expect(JSON.stringify(repeatTables(games, [record]))).toContain("Too hard");
	});

	it("is not on the response's page", () => {
		const lines = responseLines(games, record).flatMap((section) => section.lines);
		expect(lines.map((line) => line.label)).toEqual([
			"How often do you play?",
			"Have you played Chess?",
			"Have you played Go?",
			"Why have you never played Go?",
		]);
	});

	it("is not in the export", () => {
		const csv = responsesCsv(games, [record]);
		expect(csv).not.toContain("Nobody to play with");
		expect(csv).toContain("Too hard");
	});

	it("does not count towards the response's time, or as where it stopped", () => {
		// Four answers at a second each, not five.
		expect(activeMsOf(reached(games, record))).toBe(4000);
		expect(signals(games, [record]).responses[0]?.activeMs).toBe(4000);
		expect(overview(games, [record]).lastQuestions).toEqual([
			{ key: "i:go:why-not", label: "Why have you never played Go?", count: 1 },
		]);
	});
});
