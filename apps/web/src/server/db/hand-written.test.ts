import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	deleteFormStatements,
	keepApartStatement,
	replaceDefinitionStatements,
	type Statement,
	startStatements,
	withdrawStatements,
} from "../statements";

// What a failed query logs is its statement's text, on the promise that the text holds no value
// (`query-failure.ts`). A respondent's answer is a value of most of Forms' writes, so the promise
// is held here: every query goes through `createDb`, and no text is made from a value.

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

describe("every query", () => {
	it("is read from a tree that has the files it expects", () => {
		const paths = sources().map(({ path }) => path);
		expect(paths).toContain("server/db/index.ts");
		expect(paths).toContain("server/responses.ts");
		expect(paths.length).toBeGreaterThan(40);
	});

	it("reaches the D1 binding under Drizzle only in `db/index.ts`, which throws and logs as the rest", () => {
		expect(linesWith(/\$client/, ["server/db/index.ts"])).toEqual([]);
		expect(linesWith(/\.prepare\(/, ["server/db/index.ts"])).toEqual([]);
	});

	it("gets the binding from `createDb` and nowhere else", () => {
		const uses = linesWith(/env\.DB\b/);
		expect(uses.length).toBeGreaterThan(0);
		for (const use of uses) {
			// Asked whether it is there at all (`server.ts`), or handed to `createDb`.
			expect(use).toMatch(/createDb\(env\.DB\)|!env\.DB \|\|/);
		}
		expect(linesWith(/drizzle\(/, ["server/db/index.ts", "server/auth/cli.ts"])).toEqual([]);
	});

	it("is written without `sql.raw`, which would put its argument into the text", () => {
		expect(linesWith(/sql\s*\.\s*raw\b/)).toEqual([]);
	});
});

describe("a statement written by hand", () => {
	const MARK = "VALUE-";
	const marked = (name: string) => `${MARK}${name}`;

	/** No value a statement was given is in its text: each is one of its `params`. */
	function expectBound(statements: Statement[]) {
		expect(statements.length).toBeGreaterThan(0);
		for (const { sql, params } of statements) {
			expect(sql).not.toContain(MARK);
			// The one thing its text quotes is a form's state, which the code wrote.
			const quoted = [...sql.matchAll(/'[^']*'/g)].map((found) => found[0]);
			expect(quoted.filter((literal) => literal !== "'open'")).toEqual([]);
			expect(params.length).toBeGreaterThan(0);
			// Every `?n` has a value, and every value a `?n`.
			const highest = Math.max(...[...sql.matchAll(/\?(\d+)/g)].map((found) => Number(found[1])));
			expect(highest).toBe(params.length);
		}
	}

	it("takes every value as a `?`, whatever the value says", () => {
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
