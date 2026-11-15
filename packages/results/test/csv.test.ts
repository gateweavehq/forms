import { detachedQuestions } from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import { answerColumns, codebookCsv, detachedCsv, responsesCsv, toCsv } from "../src";
import { games, responses } from "./games";

const lines = (csv: string) => csv.split("\r\n");

describe("CSV", () => {
	it("quotes a cell that holds a comma, a quote or a line break, and ends every row", () => {
		expect(
			toCsv(
				["a", "b"],
				[
					["x,y", 'say "hi"'],
					["two\nlines", 3],
				],
			),
		).toBe('a,b\r\n"x,y","say ""hi"""\r\n"two\nlines",3\r\n');
	});

	it("keeps a spreadsheet from running an answer as a formula", () => {
		expect(toCsv(["a"], [["=1+1"], ["+1"], ["-1"], ["@x"], [-1]])).toBe(
			"a\r\n'=1+1\r\n'+1\r\n'-1\r\n'@x\r\n-1\r\n",
		);
	});
});

describe("the wide export", () => {
	const csv = responsesCsv(games, responses);

	it("has a column for each thing asked, an item's questions under the item", () => {
		expect(lines(csv)[0]).toBe(
			[
				"response,device,started,completed,active_seconds",
				"plays,owned,likes.strategy,likes.party,likes.coop,likes.other,likes.other.text",
				"chess.played,chess.why-not,go.played,go.why-not,draughts.played,draughts.why-not",
				"catan.played,catan.why-not,carcassonne.played,carcassonne.why-not",
				"note",
			].join(","),
		);
	});

	it("has one row for each response, complete or not", () => {
		// A header, eight responses, and the empty string after the last line end.
		expect(lines(csv)).toHaveLength(10);
		expect(lines(csv)[1]).toBe(
			[
				"r1,desk,2026-01-01T00:00:00.000Z,2026-01-01T00:10:00.000Z,19",
				"weekly,10,1,0,1,0,",
				"often,,often,,often,",
				"once,,never,Too long",
				'"He said ""no"", twice"',
			].join(","),
		);
		expect(lines(csv)[3]).toBe(
			[
				"r3,phone,2026-01-01T00:00:00.000Z,2026-01-01T00:10:00.000Z,4",
				"weekly,20,1,0,0,1,Solo",
				"never,,never,,never,",
				"never,,never,",
				"",
			].join(","),
		);
	});

	it("leaves a question that was not answered empty, whether it was seen or not", () => {
		// r4 saw "owned" and left it; r6 saw nothing at all.
		expect(lines(csv)[4]?.startsWith("r4,desk,2026-01-01T00:00:00.000Z,")).toBe(true);
		expect(lines(csv)[4]?.split(",").slice(5, 12)).toEqual(["rarely", "", "", "", "", "", ""]);
		expect(lines(csv)[6]).toBe(`r6,phone,2026-01-01T00:00:00.000Z,,0${",".repeat(18)}`);
	});

	it("does not run what someone typed", () => {
		expect(lines(csv)[2]?.endsWith(",'=cmd()")).toBe(true);
	});

	it("never has a detached answer's column", () => {
		expect(answerColumns(games).some((column) => column.questionId === "email")).toBe(false);
	});
});

describe("the codebook", () => {
	const rows = lines(codebookCsv(games));

	it("has a row for every column of the wide export, in its order", () => {
		const names = rows.slice(1, -1).map((row) => row.split(",")[0]);
		expect(names).toEqual(lines(responsesCsv(games, []))[0]?.split(","));
	});

	it("says what each column's values mean", () => {
		expect(rows).toContain(
			"plays,plays,,single_choice,How often do you play?,weekly = Most weeks; monthly = About once a month; rarely = Rarely",
		);
		expect(rows).toContain(
			"likes.party,likes,,multiple_choice,Which kinds do you like? [Party],1 = chosen; 0 = not chosen",
		);
		expect(rows).toContain(
			"go.why-not,why-not,go,short_text,Why have you never played Go?,The text",
		);
	});
});

describe("the detached export", () => {
	it("has the detached questions' columns and nothing that names a response", () => {
		const csv = detachedCsv(detachedQuestions(games), [
			{ email: "a@example.test" },
			{ email: "b@example.test" },
		]);
		expect(csv).toBe("email\r\na@example.test\r\nb@example.test\r\n");
	});
});
