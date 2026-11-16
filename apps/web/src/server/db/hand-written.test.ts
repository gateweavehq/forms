import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	deleteFormStatements,
	keepApartStatement,
	replaceDefinitionStatements,
	type Statement,
	startStatements,
	withdrawStatements,
} from "../statements";
import { createDb, readRows, runBatch } from ".";
import { faulty, migratedD1 } from "./faulty-d1";
import { refuseValues, ValueInText } from "./hand-written";

// What a failed query logs is its statement's text, on the promise that the text holds no value
// (`query-failure.ts`). A respondent's answer is a value of most of Forms' writes, so the promise
// is held in two ways. `runBatch` and `readRows` refuse, before anything is sent, a statement
// written by hand whose text is more than placeholders, SQL and the schema's names
// (`hand-written.ts`): that holds whichever file the statement is in. And the source is read for
// a way around the two, which is a search of its text and no more than that.

const src = resolve(import.meta.dirname, "../..");

/** Every source file of the app that is not a test or a test's helper, with its text. */
function sources(): Array<{ path: string; text: string }> {
	const found: Array<{ path: string; text: string }> = [];
	for (const file of readdirSync(src, { recursive: true, encoding: "utf8" })) {
		if (!/\.tsx?$/.test(file) || /\.test\.ts$/.test(file) || file.endsWith(".gen.ts")) continue;
		const path = relative(src, join(src, file)).replaceAll("\\", "/");
		if (path === "server/db/faulty-d1.ts" || path === "server/db/made-up.ts") continue;
		found.push({ path, text: readFileSync(join(src, file), "utf8") });
	}
	return found;
}

/** The lines of the app's source that match, without comments, as `path: line`. */
function linesWith(pattern: RegExp, except: string[] = []): string[] {
	return sources()
		.filter(({ path }) => !except.includes(path))
		.flatMap(({ path, text }) =>
			text
				.split("\n")
				.filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && pattern.test(line))
				.map((line) => `${path}: ${line.trim()}`),
		);
}

describe("every query, as the source reads", () => {
	it("is read from a tree that has the files it expects", () => {
		const paths = sources().map(({ path }) => path);
		expect(paths).toContain("server/db/index.ts");
		expect(paths).toContain("server/responses.ts");
		expect(paths.length).toBeGreaterThan(40);
	});

	it("reaches the D1 binding under Drizzle only in `db/index.ts`, which throws and logs as the rest", () => {
		expect(linesWith(/\$client/, ["server/db/index.ts"])).toEqual([]);
		expect(linesWith(/\.prepare\(/, ["server/db/index.ts"])).toEqual([]);
		// The same binding by its other name, which Drizzle's session keeps (`db.session.client`).
		// Reached as a property, by a key or through `Reflect`.
		expect(
			linesWith(
				/\.client\b(?!\()|\[\s*["'`](session|client)["'`]\s*\]|Reflect\.\w+\([^)]*["'`](session|client)["'`]/,
				["server/db/query-failure.ts"],
			),
		).toEqual([]);
	});

	it("names the binding only to hand it to `createDb`, or to ask whether it is there", () => {
		// `env.DB`, `const { DB } = env`, `env["DB"]`: any way of naming it.
		// (Not "D1 DB", which is how D1 names itself in the words `query-failure.ts` knows.)
		const named = /(?<!D1 )\bDB\b/;
		const uses = linesWith(named);
		expect(uses.length).toBeGreaterThan(0);
		for (const use of uses) {
			expect(use).toMatch(/createDb\(env\.DB\)|!env\.DB \|\|/);
			expect(use.match(new RegExp(named, "g"))).toHaveLength(1);
		}
		expect(linesWith(/drizzle\(/, ["server/db/index.ts", "server/auth/cli.ts"])).toEqual([]);
	});

	it("is written without `sql.raw`, which would put its argument into the text", () => {
		expect(linesWith(/sql\s*\.\s*raw\b/)).toEqual([]);
	});
});

describe("a statement written by hand", () => {
	let real: D1Database;
	let dispose: () => Promise<void>;
	let printed: unknown[][];

	beforeAll(async () => {
		({ d1: real, dispose } = await migratedD1("hand-written-test"));
	});
	afterAll(async () => {
		await dispose?.();
	});
	beforeEach(() => {
		printed = [];
		for (const level of ["error", "warn", "log"] as const) {
			vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
				printed.push(args);
			});
		}
		return () => {
			vi.restoreAllMocks();
		};
	});

	const ID = "TnurgeUNhMCsjqNc";

	/** What threw, or nothing. */
	async function thrownBy(work: () => Promise<unknown>): Promise<unknown> {
		try {
			await work();
		} catch (error) {
			return error;
		}
		return undefined;
	}

	/** Refused before the database or a log saw it, in words that do not repeat it. */
	async function expectRefused(send: (db: ReturnType<typeof createDb>) => Promise<unknown>) {
		const { database, state } = faulty(real);
		const error = await thrownBy(() => send(createDb(database)));
		expect(error).toBeInstanceOf(ValueInText);
		expect((error as Error).message).not.toContain(ID);
		expect(state.sent).toEqual([]);
		expect(state.batches).toEqual([]);
		expect(printed).toEqual([]);
	}

	// The two a review of this code wrote, which every other test let through.
	it("is refused with a response's id in the text of a read, as one response's answers could be read", async () => {
		await expectRefused((db) =>
			readRows(db, {
				sql: `SELECT response_id, question_id, item_id, value, active_ms, changes
					FROM answer WHERE response_id = '${ID}'`,
				params: [],
			}),
		);
	});

	it("is refused with a response's id in the text of a batch, and the statement beside it is not sent", async () => {
		await expectRefused((db) =>
			runBatch(db, [
				{ sql: "DELETE FROM answer WHERE response_id = ?1", params: [ID] },
				{ sql: `DELETE FROM response WHERE id = '${ID}' AND form_id = ?1`, params: ["a-form"] },
			]),
		);
	});

	const refused: Array<[what: string, sql: string, params: string[]]> = [
		[
			"a number that is not bound, as a kept-apart row's key",
			"DELETE FROM detached_answer WHERE id = 4503599627370",
			[],
		],
		[
			"a word that is not the schema's, as an id without its quotes",
			`SELECT id FROM response WHERE id = ${ID}`,
			[],
		],
		["a value in double quotes", `SELECT id FROM response WHERE id = "${ID}"`, []],
		["a quote that is never closed", `SELECT id FROM response WHERE id = '${ID}`, []],
		["a state no form has, in quotes", "SELECT id FROM form WHERE state = 'opened'", []],
		["a comment, which could say anything", `SELECT id FROM response -- ${ID}`, []],
		["a second statement", "SELECT id FROM response; DELETE FROM response", []],
		["a value with no placeholder", "SELECT id FROM response WHERE id = ?1", [ID, ID]],
		["a placeholder with no value", "SELECT id FROM response WHERE id = ?1 AND form_id = ?2", [ID]],
		["a placeholder left out", "SELECT id FROM response WHERE id = ?1 AND form_id = ?3", [ID, ID]],
		["a placeholder without its number", "SELECT id FROM response WHERE id = ?", [ID]],
	];

	it.each(refused)("is refused with %s", async (_what, sql, params) => {
		await expectRefused((db) => readRows(db, { sql, params }));
		await expectRefused((db) => runBatch(db, [{ sql, params }]));
	});

	it("is sent when its text is placeholders, SQL and the schema's names", async () => {
		const db = createDb(real);
		expect(
			await readRows(db, {
				sql: "SELECT count(*) FROM form WHERE state = 'open' AND owner_id = ?1 LIMIT ?2",
				params: ["nobody", 1],
			}),
		).toEqual([{ "count(*)": 0 }]);
		expect(
			await runBatch(db, [{ sql: "DELETE FROM response WHERE id = ?1 AND 1 = 1", params: [ID] }]),
		).toEqual([0]);
	});

	const MARK = "VALUE-";
	const marked = (name: string) => `${MARK}${name}`;

	/** Each statement would be sent, and none has a value it was given in its text. */
	function expectBound(statements: Statement[]) {
		expect(statements.length).toBeGreaterThan(0);
		for (const statement of statements) {
			expect(() => refuseValues(statement)).not.toThrow();
			expect(statement.sql).not.toContain(MARK);
		}
	}

	it("passes for every statement that asks again, whatever its values say", () => {
		expectBound(
			startStatements({
				id: marked("id"),
				formId: marked("form"),
				hash: marked("hash"),
				json: marked("json"),
				answersVersion: 1,
				seal: marked("seal"),
				device: marked("device"),
				now: 1,
			}),
		);
		expectBound([
			keepApartStatement({ id: 1, formId: marked("form"), answers: marked("answers") }),
		]);
		for (const afterCompletion of [true, false]) {
			expectBound(
				withdrawStatements({
					responseId: marked("response"),
					definitionHash: marked("hash"),
					afterCompletion,
				}),
			);
		}
		for (const hasController of [true, false]) {
			expectBound(
				replaceDefinitionStatements({
					formId: marked("form"),
					ownerId: marked("owner"),
					hash: marked("hash"),
					json: marked("json"),
					title: marked("title"),
					hasController,
					now: 1,
				}),
			);
		}
		expectBound(deleteFormStatements({ id: marked("form"), ownerId: marked("owner") }));
	});
});
