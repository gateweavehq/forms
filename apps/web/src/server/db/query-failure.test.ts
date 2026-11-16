import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inspect } from "node:util";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, SIGN_UP_CLOSED } from "../auth/config";
import {
	createForm,
	deleteAccount,
	deleteAllResponses,
	deleteForm,
	ownedForm,
	Refused,
} from "../owner";
import {
	createResponse,
	findResponse,
	saveDetached,
	saveProgress,
	withdrawResponse,
} from "../responses";
import { loadDetached, loadRecords } from "../results";
import { createDb, readRows, runBatch, schema } from ".";
import { faulty, LOCAL, migratedD1 } from "./faulty-d1";
import { teaDefinition, unownedForm, withOwnedForm } from "./made-up";
import { DatabaseError, REFUSALS, withoutStatements } from "./query-failure";
import { READ_ATTEMPTS } from "./retry-reads";

// A query of D1 that failed for good. Drizzle's error for it is `Failed query: select … params:
// …`, with every value the statement was given. Better Auth logged the one for a session read,
// token included, and the one for a sign-in, address included, and a page showed the one for its
// own read. Most of what Forms writes has a person's answer among its values.

// `../forms` reads its settings from the Worker's runtime, which is not here.
vi.mock("cloudflare:workers", () => ({ env: {} }));

// A sign-up through Better Auth hashes a password, which takes over a second when nothing else
// runs and several beside the other suites, each with a local runtime of its own.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let real: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
	({ d1: real, dispose } = await migratedD1("query-failure-test"));
});

afterAll(async () => {
	await dispose?.();
});

/** Every call to the console, as the console would print it: an error's fields and causes too. */
let printed: string[];

beforeEach(() => {
	printed = [];
	for (const level of ["error", "warn", "info", "log", "debug"] as const) {
		vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
			printed.push(
				`${level}: ${args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 8 }))).join(" ")}`,
			);
		});
	}
});

afterEach(() => {
	vi.restoreAllMocks();
});

const logged = () => printed.join("\n");

/** The lines this module logs: a kind and a reference each, and the statement if there was one. */
const failures = () =>
	printed.flatMap((line) => {
		const found = /^error: d1: a query failed \((.+?)\), reference ([0-9a-f]{8})(?:: (.+))?$/.exec(
			line,
		);
		return found ? [{ kind: found[1], reference: found[2], statement: found[3] }] : [];
	});

/** What threw, or nothing. */
async function thrownBy(work: () => Promise<unknown>): Promise<unknown> {
	try {
		await work();
	} catch (error) {
		return error;
	}
	return undefined;
}

const secret = "a-test-secret-that-is-long-enough-for-better-auth";
const baseURL = "https://forms.test";
const PASSWORD = "a-long-test-password";

describe("a session read that failed for good", () => {
	it("logs the statement and none of its values, so no token", async () => {
		const { database, state } = faulty(real);
		const auth = createAuth({ db: createDb(database), secret, baseURL });
		const { headers } = await auth.api.signUpEmail({
			body: { name: "Rio", email: "rio@failure.test", password: PASSWORD },
			returnHeaders: true,
		});
		const cookie = headers
			.getSetCookie()
			.map((line) => line.split(";")[0])
			.join("; ");
		const value = decodeURIComponent(/session_token=([^;]+)/.exec(cookie)?.[1] ?? "");
		const token = value.split(".")[0] ?? "";
		// The token the cookie carries is the one the statement looks for.
		const stored = await real.prepare("select token from session").all<{ token: string }>();
		expect(stored.results.map((row) => row.token)).toContain(token);

		printed.length = 0;
		state.failures = READ_ATTEMPTS;
		const error = await thrownBy(() => auth.api.getSession({ headers: new Headers({ cookie }) }));

		// Better Auth logs what it caught, and throws its own error with that as the cause.
		expect(logged()).toContain("[Better Auth]");
		expect(logged()).not.toContain(token);
		expect(logged()).not.toContain("Failed query");
		expect(logged()).not.toContain("params");
		// What Better Auth logs is the error, which has nothing of the statement.
		const theirs = printed.filter((line) => line.includes("[Better Auth]")).join("\n");
		expect(theirs).not.toMatch(/select/i);
		expect(inspect(error, { depth: 8 })).not.toContain(token);
		expect(inspect(error, { depth: 8 })).not.toMatch(/select/i);

		// Still enough to find it by: the kind in the log, under the reference the error has.
		const cause = (error as Error).cause;
		expect(cause).toBeInstanceOf(DatabaseError);
		const { kind, reference } = cause as DatabaseError;
		expect(kind).toBe("D1_ERROR, local-commit-token");
		const [failure, ...others] = failures();
		expect(others).toEqual([]);
		expect(failure).toMatchObject({ kind, reference });
		// The statement as it was sent, with a `?` where the token was.
		expect(failure?.statement).toMatch(/^select "id", .* where "session"\."token" = \? limit \?$/);
		// The cause says the kind and nothing else, for code that reads causes.
		expect(((cause as Error).cause as Error).message).toBe(kind);
		expect((cause as DatabaseError).message).toBe(
			`A database query failed (reference ${reference})`,
		);
	});

	it("logs a sign-in's statement and not the address it looked for", async () => {
		const { database, state } = faulty(real);
		const auth = createAuth({ db: createDb(database), secret, baseURL });
		const email = "sasha@failure.test";
		await auth.api.signUpEmail({ body: { name: "Sasha", email, password: PASSWORD } });

		printed.length = 0;
		state.failures = READ_ATTEMPTS;
		const error = await thrownBy(() =>
			auth.api.signInEmail({ body: { email, password: PASSWORD } }),
		);

		expect(error).toBeDefined();
		expect(logged()).not.toContain(email);
		expect(logged()).not.toContain("Failed query");
		expect(inspect(error, { depth: 8 })).not.toContain(email);
		expect(failures()[0]?.statement).toMatch(/ from "user" "user" where "user"\."email" = \? /);
	});
});

describe("a query that failed", () => {
	const SECRET = "a-value-nobody-should-see";

	it("throws an error without its statement or its values", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		state.message = "D1_ERROR: D1 DB is overloaded. Requests queued for too long.";

		const error = await thrownBy(() =>
			db.select().from(schema.form).where(eq(schema.form.ownerId, SECRET)).all(),
		);

		expect(error).toBeInstanceOf(DatabaseError);
		const shown = inspect(error, { depth: 8 });
		expect(shown).not.toContain(SECRET);
		expect(shown).not.toMatch(/select|params|owner_id/i);
		expect((error as DatabaseError).kind).toBe("D1_ERROR, queued-too-long");
		expect(failures()).toMatchObject([
			{ kind: "D1_ERROR, queued-too-long", reference: (error as DatabaseError).reference },
		]);
		// The log has the statement, with a `?` where the value was.
		expect(failures()[0]?.statement).toMatch(/ from "form" where "form"\."owner_id" = \?$/);
		expect(logged()).not.toContain(SECRET);
		expect(logged()).not.toContain("params");
	});

	it("logs a statement with a token among its values, and not the token", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const token = "kJ8sT0kEnT0kEnT0kEnT0kEnT0kEn";
		state.failures = 1;
		state.message = "D1_ERROR: something nobody has seen before";

		await thrownBy(() =>
			db.select().from(schema.session).where(eq(schema.session.token, token)).all(),
		);

		expect(failures()[0]?.statement).toMatch(/ from "session" where "session"\."token" = \?$/);
		expect(logged()).not.toContain(token);
	});

	it("cuts a long statement short", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		const ids = Array.from({ length: 400 }, (_, index) => `id-${index}`);

		await thrownBy(() =>
			db.select().from(schema.response).where(inArray(schema.response.id, ids)).all(),
		);

		const statement = failures()[0]?.statement ?? "";
		expect(statement.length).toBe(601);
		expect(statement.endsWith("…")).toBe(true);
	});

	// What Cloudflare's D1 error list and SQLite say in fixed words, by a name each.
	it.each([
		["overloaded", "D1_ERROR: D1 DB is overloaded."],
		["queue-full", "D1_ERROR: D1 DB is overloaded. Too many requests queued."],
		["cpu-reset", "D1_ERROR: D1 DB exceeded its CPU time limit and was reset."],
		["memory-reset", "D1_ERROR: D1 DB's isolate exceeded its memory limit and was reset."],
		[
			"storage-timeout",
			"D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.",
		],
		[
			"response-too-large",
			"D1_ERROR: D1 query result exceeded the maximum response size limit of 50 MB",
		],
		["too-many-variables", "D1_ERROR: too many SQL variables at offset 412: SQLITE_ERROR"],
		["syntax-error", 'D1_ERROR: near "form": syntax error at offset 9: SQLITE_ERROR'],
	])("names what D1 says in fixed words: %s", async (label, message) => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		state.message = message;

		const error = await thrownBy(() => db.select().from(schema.form).all());

		const sqlite = message.endsWith(": SQLITE_ERROR") ? "SQLITE_ERROR, " : "";
		expect((error as DatabaseError).kind).toBe(`D1_ERROR, ${sqlite}${label}`);
	});

	it("names a failure without D1's code by its fixed words alone", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		state.message = "Too many API requests by single worker invocation.";

		const error = await thrownBy(() => db.select().from(schema.form).all());

		expect((error as DatabaseError).kind).toBe("too-many-api-requests");
	});

	// Words that name a table or a code may be what a row held, wherever D1 quotes one.
	it.each([
		[
			"a table's name inside a body it could not read",
			'D1_ERROR: Failed to parse body as JSON, got: {"note":"no such table: SECRETWORD"}',
			"SECRETWORD",
		],
		["a code in the middle of its words", "D1_ERROR: row said SQLITE_SECRET_WORD", "SECRET_WORD"],
		[
			"a constraint's name after a colon further in",
			"D1_ERROR: Failed to parse body as JSON, got: UNIQUE constraint failed: SECRETWORD",
			"SECRETWORD",
		],
	])("quotes D1 only where it speaks for itself, not %s", async (_what, message, word) => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		state.message = message;

		const error = await thrownBy(() => db.select().from(schema.form).all());

		expect((error as DatabaseError).kind).toBe("D1_ERROR");
		expect(inspect(error, { depth: 8 })).not.toContain(word);
		expect(logged()).not.toContain(word);
	});

	type Db = ReturnType<typeof createDb>;

	it.each([
		["get", (db: Db) => db.select().from(schema.form).get()],
		["values", (db: Db) => db.select().from(schema.form).values()],
		["run", (db: Db) => db.delete(schema.retiredFormId).run()],
		["await", async (db: Db) => await db.select().from(schema.form)],
		[
			"the relational API",
			(db: Db) => db.query.user.findFirst({ where: eq(schema.user.email, SECRET) }),
		],
		["a transaction", (db: Db) => db.transaction((tx) => tx.select().from(schema.form).all())],
		[
			"a read of one row through Drizzle's `sql`",
			(db: Db) => db.get(sql`SELECT count(*) AS n FROM form WHERE owner_id = ${SECRET}`),
		],
		[
			"a read of several through Drizzle's `sql`",
			(db: Db) => db.all(sql`SELECT id FROM form WHERE owner_id = ${SECRET}`),
		],
		["a count", (db: Db) => db.$count(schema.form)],
		[
			"a delete that returns its rows",
			(db: Db) =>
				db
					.delete(schema.detachedAnswer)
					.where(eq(schema.detachedAnswer.formId, SECRET))
					.returning(),
		],
		// The two ways Forms sends what it writes by hand, which do not go through Drizzle.
		[
			"a read written by hand",
			(db: Db) =>
				readRows(db, { sql: "SELECT id FROM form WHERE owner_id = ?1", params: [SECRET] }),
		],
		[
			"a batch written by hand",
			(db: Db) =>
				runBatch(db, [
					{ sql: "UPDATE form SET title = ?2 WHERE owner_id = ?1", params: [SECRET, SECRET] },
				]),
		],
		[
			"a batch of Drizzle's",
			(db: Db) => db.batch([db.select().from(schema.form).where(eq(schema.form.ownerId, SECRET))]),
		],
	])("whichever way it was sent: %s", async (_way, send) => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		// A transaction's `begin` and `rollback` fail too, whichever comes first.
		state.failures = 3;
		state.batchFailures = 1;
		state.message = "D1_ERROR: something nobody has seen before";

		const error = await thrownBy(() => send(db));

		expect(error).toBeInstanceOf(DatabaseError);
		expect(inspect(error, { depth: 8 })).not.toMatch(/select|delete|update|begin|params/i);
		expect(inspect(error, { depth: 8 })).not.toContain(SECRET);
		expect(logged()).not.toContain(SECRET);
		// One line in the log for it, under the reference the error has.
		expect(failures().map(({ reference }) => reference)).toContain(
			(error as DatabaseError).reference,
		);
	});

	it("logs the text of what was written by hand, with its `?1`, for a read and for a batch", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		state.batchFailures = 1;
		state.message = "D1_ERROR: something nobody has seen before";

		await thrownBy(() =>
			readRows(db, { sql: "SELECT id\n\t\tFROM form WHERE owner_id = ?1", params: [SECRET] }),
		);
		await thrownBy(() =>
			runBatch(db, [
				{ sql: "UPDATE form SET title = ?2 WHERE owner_id = ?1", params: [SECRET, SECRET] },
				{ sql: "DELETE FROM form WHERE owner_id = ?1", params: [SECRET] },
			]),
		);

		expect(failures().map(({ statement }) => statement)).toEqual([
			"SELECT id FROM form WHERE owner_id = ?1",
			"UPDATE form SET title = ?2 WHERE owner_id = ?1; DELETE FROM form WHERE owner_id = ?1",
		]);
	});

	it("names a constraint, which is the schema's and no value", async () => {
		const db = createDb(real);
		const row = { id: 3001, formId: SECRET, answers: SECRET };
		await db.insert(schema.detachedAnswer).values(row);

		const error = await thrownBy(() => db.insert(schema.detachedAnswer).values(row).run());

		expect(error).toBeInstanceOf(DatabaseError);
		expect((error as DatabaseError).kind).toBe(
			"D1_ERROR, SQLITE_CONSTRAINT, UNIQUE constraint failed: detached_answer.id",
		);
		expect(inspect(error, { depth: 8 })).not.toContain(SECRET);
		expect(logged()).not.toContain(SECRET);
	});

	it("names a passing failure that outlasted its resends", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = READ_ATTEMPTS;
		state.message = LOCAL;

		const error = await thrownBy(() => db.select().from(schema.form).all());

		expect((error as DatabaseError).kind).toBe("D1_ERROR, local-commit-token");
	});

	it("repeats nothing D1 said beyond that: its words can carry what a row held", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		state.failures = 1;
		state.message = `D1_ERROR: Failed to parse body as JSON, got: {"value":"${SECRET}"}`;

		const error = await thrownBy(() => db.select().from(schema.form).all());

		expect((error as DatabaseError).kind).toBe("D1_ERROR");
		expect(inspect(error, { depth: 8 })).not.toContain(SECRET);
		expect(logged()).not.toContain(SECRET);
	});

	it("says as little when a batch fails, which fails in D1's words", async () => {
		const db = createDb(real);
		const row = { id: 3002, formId: SECRET, answers: SECRET };

		const error = await thrownBy(() =>
			db.batch([
				db.insert(schema.detachedAnswer).values(row),
				db.insert(schema.detachedAnswer).values(row),
			]),
		);

		expect(error).toBeInstanceOf(DatabaseError);
		expect((error as DatabaseError).kind).toContain("UNIQUE constraint failed: detached_answer.id");
		expect(inspect(error, { depth: 8 })).not.toContain(SECRET);
		expect(logged()).not.toContain(SECRET);
	});

	it("leaves alone what fails while a batch is put together, before the database is asked", async () => {
		const db = createDb(real);
		const broken = new TypeError("not a query");
		const notAQuery = {
			_prepare() {
				throw broken;
			},
		};

		const error = await thrownBy(() =>
			db.batch([notAQuery] as unknown as Parameters<typeof db.batch>[0]),
		);

		expect(error).toBe(broken);
		expect(printed).toEqual([]);
	});

	it("leaves a query that worked alone", async () => {
		const db = createDb(real);
		expect(await db.select().from(schema.form).where(eq(schema.form.ownerId, "nobody"))).toEqual(
			[],
		);
		expect(await readRows(db, { sql: "SELECT 1 AS n", params: [] })).toEqual([{ n: 1 }]);
		expect(printed).toEqual([]);
	});
});

// None of what `withoutStatements` reaches for is in Drizzle's public types, so a version may
// take it away. Then the statements would be in the errors again, and nothing would say so.
describe("a Drizzle that is not as expected", () => {
	const client = { batch: async () => [] };

	it.each([
		["no session", {}],
		["a session that prepares no query", { session: { client } }],
		["a session without its client", { session: { prepareQuery: () => ({}) } }],
		["a client that sends no batch", { session: { prepareQuery: () => ({}), client: {} } }],
	])("is refused when the database is made: %s", (_what, db) => {
		expect(() => withoutStatements(db)).toThrow("Drizzle's session cannot be reached");
	});

	it("is refused at the first query when a prepared query is sent by another name", () => {
		const session = { prepareQuery: () => ({ execute: async () => [] }), client };
		withoutStatements({ session });

		expect(() => session.prepareQuery()).toThrow("Drizzle's prepared query is sent some other way");
	});

	it("is accepted when a prepared query has any of the four", async () => {
		const session = { prepareQuery: () => ({ all: async () => ["a row"] }), client };
		withoutStatements({ session });

		expect(await session.prepareQuery().all()).toEqual(["a row"]);
	});
});

describe("what SQLite refused, in the local runtime's own words", () => {
	it.each([
		["a table that is not there", "select * from nope", "SQLITE_ERROR, no such table: nope"],
		["a column that is not there", "select nope from form", "SQLITE_ERROR, no such column: nope"],
		["a statement it cannot read", "selec 1", "SQLITE_ERROR, syntax-error"],
	])("names %s", async (_what, statement, kind) => {
		const db = createDb(real);

		const error = await thrownBy(() => db.run(sql.raw(statement)));

		expect((error as DatabaseError).kind).toBe(`D1_ERROR, ${kind}`);
	});

	it("names the table a database that was never migrated does not have", async () => {
		const { d1, dispose: disposeEmpty } = await migratedD1("query-failure-empty", {
			migrate: false,
		});
		try {
			const error = await thrownBy(() => findResponse(createDb(d1), "an-id", "a-secret"));

			expect((error as DatabaseError).kind).toBe("D1_ERROR, SQLITE_ERROR, no such table: response");
		} finally {
			await disposeEmpty();
		}
	});
});

// A trigger refuses a write in words of its own (`RAISE(ABORT, …)`). Those of the migrations
// are the migrations' words, never a row's, and say which rule held, so they may be quoted, and
// are listed in `REFUSALS`. Forms has none so far: the list is empty, and this holds it to the
// migrations for when one is added.
describe("what a trigger refused", () => {
	/** Every refusal the migrations hold, as SQLite will word it. */
	function refusals(): string[] {
		const migrations = resolve(import.meta.dirname, "../../../migrations");
		const found = new Set<string>();
		for (const file of readdirSync(migrations).filter((each) => each.endsWith(".sql"))) {
			const text = readFileSync(join(migrations, file), "utf8");
			for (const [, words] of text.matchAll(/RAISE\s*\(\s*ABORT\s*,\s*'([^']+)'\s*\)/gi)) {
				if (words) found.add(words);
			}
		}
		return [...found];
	}

	it("is listed for every refusal the migrations hold, and for no other", () => {
		expect([...REFUSALS].sort()).toEqual(refusals().sort());
		// The words go into a pattern as they are.
		for (const words of REFUSALS) expect(words).toMatch(/^[\w ,'-]+$/);
	});

	it("is named for every refusal the migrations hold", async () => {
		for (const words of refusals()) {
			const { database, state } = faulty(real);
			const db = createDb(database);
			state.failures = 1;
			// As D1 words a trigger's refusal.
			state.message = `D1_ERROR: ${words}: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)`;

			const error = await thrownBy(() => db.delete(schema.retiredFormId).run());

			expect((error as DatabaseError).kind).toBe(`D1_ERROR, SQLITE_CONSTRAINT, ${words}`);
		}
	});

	it("is not quoted when the trigger is not the migrations': its words could be anyone's", async () => {
		const db = createDb(real);
		await real
			.prepare("INSERT INTO retired_form_id (form_id, owner_id) VALUES ('kept', 'x')")
			.run();
		await real
			.prepare(
				`CREATE TRIGGER not_ours BEFORE DELETE ON retired_form_id
				BEGIN SELECT RAISE(ABORT, 'words nobody listed'); END`,
			)
			.run();
		try {
			const error = await thrownBy(() =>
				db.delete(schema.retiredFormId).where(eq(schema.retiredFormId.formId, "kept")).run(),
			);

			expect((error as DatabaseError).kind).toBe("D1_ERROR, SQLITE_CONSTRAINT");
			expect(logged()).not.toContain("words nobody listed");
			expect(failures()[0]?.statement).toBe(
				'delete from "retired_form_id" where "retired_form_id"."form_id" = ?',
			);
		} finally {
			await real.prepare("DROP TRIGGER not_ours").run();
		}
	});
});

// What a respondent gives is the value of most of Forms' writes, and a typed answer can be
// anything a person wrote. D1's own words are made to carry it here, as the worst case: a body
// D1 could not read, quoted back.
describe("a respondent's answers", () => {
	const TYPED = "I drink tea because my manager, Ms Example of Sampleton, does not";
	const ADDRESS = "a-reader@example.test";
	/** D1 quoting what it was sent, values included. */
	const quoting = (...values: string[]) =>
		`D1_ERROR: Failed to parse body as JSON, got: ${JSON.stringify(values)}`;

	async function begun(d1: D1Database, id: string, owned: boolean) {
		const db = createDb(d1);
		const form = owned ? (await withOwnedForm(real, id)).form : await unownedForm(id);
		const started = await createResponse(db, form, "phone");
		const row = await findResponse(db, started.id, started.secret);
		if (!row) throw new Error("The response was not made");
		return { db, form, started, row };
	}

	/** Nothing of what a respondent holds or gave is in the log or in what was thrown. */
	function expectNothingOf(error: unknown, ...values: string[]) {
		expect(error).toBeInstanceOf(DatabaseError);
		for (const value of values) {
			expect(logged()).not.toContain(value);
			expect(inspect(error, { depth: 8 })).not.toContain(value);
		}
		expect(logged()).not.toContain("Failed query");
		expect(logged()).not.toContain("params");
	}

	it.each([
		["an example", false],
		["a form someone owns", true],
	])("are in no log and no error when saving one fails, for %s", async (_which, owned) => {
		const { database, state } = faulty(real);
		const { db, form, started, row } = await begun(database, `tea-save-${owned}`, owned);

		printed.length = 0;
		state.batchFailures = 1;
		state.message = quoting(started.id, "why", TYPED, row.secretSeal);
		const save = { answer: { question: "why", value: TYPED, activeMs: 900 }, position: "q:why" };
		const error = await thrownBy(() => saveProgress(db, form.definition, row, save));

		expectNothingOf(error, TYPED, started.secret, row.secretSeal, started.id);
		// The log has the statements, where the answer is `?4`.
		const [failure, ...others] = failures();
		expect(others).toEqual([]);
		expect(failure?.kind).toBe("D1_ERROR");
		expect(failure?.statement).toMatch(/^INSERT INTO answer \(.*\) SELECT \?1, \?2, \?3, \?4, /);
		// Nothing was stored, and nothing says it was: the page sends it again.
		const stored = () =>
			real
				.prepare("select value from answer where response_id = ?")
				.bind(started.id)
				.all<{ value: string }>();
		expect((await stored()).results).toEqual([]);
		await saveProgress(db, form.definition, row, save);
		expect((await stored()).results).toEqual([{ value: JSON.stringify(TYPED) }]);
	});

	it("are in no log when the response they belong to cannot be read", async () => {
		const { database, state } = faulty(real);
		const { db, started, row } = await begun(database, "tea-read", false);

		printed.length = 0;
		state.failures = 1;
		state.message = quoting(started.id, row.secretSeal);
		const error = await thrownBy(() => findResponse(db, started.id, started.secret));

		expectNothingOf(error, started.secret, row.secretSeal, started.id);
		expect(failures()[0]?.statement).toMatch(/ from "response" where "response"\."id" = \?$/);
	});

	it.each([
		["an example, through Drizzle", false],
		["a form someone owns, through the statement that asks again", true],
	])("are in no log when what is kept apart cannot be stored, for %s", async (_which, owned) => {
		const { database, state } = faulty(real);
		const id = `tea-apart-${owned}`;
		const db = createDb(database);
		const form = owned ? (await withOwnedForm(real, id)).form : await unownedForm(id);

		state.failures = 1;
		state.batchFailures = 1;
		state.message = quoting(id, ADDRESS);
		const error = await thrownBy(() => saveDetached(db, form, { email: ADDRESS }));

		expectNothingOf(error, ADDRESS);
		expect(failures()).toHaveLength(1);
		expect(failures()[0]?.statement).toMatch(/^insert into "?detached_answer"? /i);
		const kept = await real
			.prepare("select count(*) as n from detached_answer where form_id = ?")
			.bind(id)
			.first<{ n: number }>();
		expect(kept?.n).toBe(0);
	});

	it("are in no log when taking them back fails, and are still there", async () => {
		const { database, state } = faulty(real);
		const { db, form, started, row } = await begun(database, "tea-withdrawn", true);
		await saveProgress(db, form.definition, row, {
			answer: { question: "why", value: TYPED, activeMs: 900 },
		});

		printed.length = 0;
		state.batchFailures = 1;
		state.message = quoting(started.id, TYPED, row.secretSeal);
		const error = await thrownBy(() => withdrawResponse(db, form.definition, row, form));

		expectNothingOf(error, TYPED, started.secret, row.secretSeal, started.id);
		expect(failures()[0]?.statement).toMatch(/^UPDATE definition SET withdrawn = withdrawn \+ 1 /);
		const left = await real
			.prepare("select count(*) as n from answer where response_id = ?")
			.bind(started.id)
			.first<{ n: number }>();
		expect(left?.n).toBe(1);
		// Asked again, it is done, and counted once.
		expect(await withdrawResponse(db, form.definition, row, form)).toBe("withdrawn");
		const counted = await real
			.prepare("select withdrawn from definition where hash = ?")
			.bind(form.hash)
			.first<{ withdrawn: number }>();
		expect(counted?.withdrawn).toBe(1);
	});

	it("are in no log when an export of them fails, by either of its reads", async () => {
		const { database, state } = faulty(real);
		const { db, form, started, row } = await begun(database, "tea-export", true);
		await saveProgress(db, form.definition, row, {
			answer: { question: "why", value: TYPED, activeMs: 900 },
		});
		await saveDetached(db, form, { email: ADDRESS });
		const owned = await ownedForm(
			db,
			{ id: "owner-of-tea-export", name: "Test Owner", email: "tea-export@example.test" },
			"tea-export",
		);
		const records = await loadRecords(db, owned, form.hash);
		expect(JSON.stringify(records)).toContain(TYPED);

		// The responses first, which Drizzle reads; then their answers, read by hand in pages.
		for (const before of [0, 1]) {
			printed.length = 0;
			state.sent.length = 0;
			let sent = 0;
			const failing = new Proxy(database, {
				get(target, key) {
					const value: unknown = Reflect.get(target, key, target);
					if (typeof value !== "function") return value;
					if (key !== "prepare") return value.bind(target);
					return (query: string) => {
						if (sent++ === before) {
							state.failures = 1;
							state.message = quoting(started.id, TYPED);
						}
						return target.prepare(query);
					};
				},
			});
			const error = await thrownBy(() => loadRecords(createDb(failing), owned, form.hash));

			expectNothingOf(error, TYPED, started.id, row.secretSeal);
			expect(failures()).toHaveLength(1);
			expect(failures()[0]?.statement).toMatch(
				before === 0
					? / from "response" where /
					: /^SELECT a\.response_id, .* FROM response r JOIN answer a /,
			);
		}

		// What the form keeps apart, once it is closed.
		await real.prepare("update form set state = 'closed' where id = 'tea-export'").run();
		for (let extra = 0; extra < 4; extra++) {
			await real
				.prepare("insert into detached_answer (id, form_id, answers) values (?, 'tea-export', ?)")
				.bind(4000 + extra, `{"email":"reader-${extra}@example.test"}`)
				.run();
		}
		const closed = { ...owned, state: "closed" as const };
		expect(JSON.stringify(await loadDetached(db, closed))).toContain(ADDRESS);
		printed.length = 0;
		state.failures = 1;
		state.message = quoting(ADDRESS);
		const error = await thrownBy(() => loadDetached(db, closed));
		expectNothingOf(error, ADDRESS);
	});
});

// Nothing in Forms reads a database error to decide what to answer: what could be a duplicate or
// a refusal is asked about first, or asked about again after the failure. So a `DatabaseError` in
// place of Drizzle's must leave each of these answers as it was.
describe("an answer that follows a refusal by the database", () => {
	async function refusedWith(work: () => Promise<unknown>) {
		const error = await thrownBy(work);
		return error instanceof Refused ? { status: error.status, message: error.message } : error;
	}

	const takenWords = (id: string) =>
		`The id "${id}" is taken. A form's id is its address, so each needs its own: change "id" in the definition.`;

	// `createForm` asks whether the id is free, then writes. Another request for the same id
	// that gets in between makes the table's key refuse the write, and the answer has to stay
	// the one a taken id gets, not a 500.
	it("still tells whoever lost the id that it is taken, when the table's key is what refused", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const loser = { id: "loser", name: "Test Loser", email: "loser@example.test" };
		await real
			.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
			.bind(loser.id, loser.name, loser.email)
			.run();

		// The first batch asks whether the id is free. The other request's form arrives before
		// the second, which writes.
		state.beforeBatch = async () => {
			state.beforeBatch = async () => {
				await withOwnedForm(real, "raced-for");
			};
		};
		const refused = await refusedWith(() => createForm(db, loser, teaDefinition("raced-for")));

		expect(refused).toEqual({ status: 409, message: takenWords("raced-for") });
		// The write did fail, and is in the log by the key's name.
		expect(failures().map(({ kind }) => kind)).toEqual([
			"D1_ERROR, SQLITE_CONSTRAINT, UNIQUE constraint failed: form.id",
		]);
		const owner = await real
			.prepare("SELECT owner_id FROM form WHERE id = 'raced-for'")
			.first<{ owner_id: string }>();
		expect(owner?.owner_id).toBe("owner-of-raced-for");
	});

	it("still fails, and not with 'taken', when the write fails and the id is free", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const { user } = await withOwnedForm(real, "writes-elsewhere");

		state.beforeBatch = async () => {
			state.batchFailures = 1;
			state.message = "D1_ERROR: D1 DB is overloaded.";
		};
		const refused = await refusedWith(() => createForm(db, user, teaDefinition("never-written")));

		expect(refused).toBeInstanceOf(DatabaseError);
	});

	it("still refuses a retired id and an id with answers under it in the same words, with no failure", async () => {
		const db = createDb(real);
		const { user } = await withOwnedForm(real, "asks-first");
		await real
			.prepare(
				"INSERT INTO retired_form_id (form_id, owner_id) VALUES ('once-theirs', 'someone-else')",
			)
			.run();
		await real
			.prepare(
				"INSERT INTO detached_answer (id, form_id, answers) VALUES (5001, 'once-answered', '{}')",
			)
			.run();

		for (const id of ["once-theirs", "once-answered", "asks-first"]) {
			expect(await refusedWith(() => createForm(db, user, teaDefinition(id)))).toEqual({
				status: 409,
				message: takenWords(id),
			});
		}
		expect(failures()).toEqual([]);
	});

	// As a batch that is too large is refused: nothing of it happened.
	it("still says in words that nothing was deleted when the database refuses the batch", async () => {
		const db = createDb(real);
		const { form, user } = await withOwnedForm(real, "too-much");
		await createResponse(db, form, "desk");
		const row = await ownedForm(db, user, "too-much");
		await real
			.prepare(
				`CREATE TRIGGER too_much BEFORE DELETE ON response WHEN OLD.form_id = 'too-much'
				BEGIN SELECT RAISE(ABORT, 'too much for one step'); END`,
			)
			.run();
		try {
			for (const remove of [deleteForm, deleteAllResponses]) {
				printed.length = 0;
				const refused = (await refusedWith(() => remove(db, row))) as {
					status: number;
					message: string;
				};

				expect(refused.status).toBe(503);
				expect(refused.message).toContain("so nothing was deleted");
				expect(failures().map(({ kind }) => kind)).toEqual(["D1_ERROR, SQLITE_CONSTRAINT"]);
				expect(logged()).toContain("owner: delete failed, DatabaseError");
				const left = await real
					.prepare("SELECT count(*) AS n FROM response WHERE form_id = 'too-much'")
					.first<{ n: number }>();
				expect(left?.n).toBe(1);
			}
		} finally {
			await real.prepare("DROP TRIGGER too_much").run();
		}
		await deleteForm(db, row);
		expect(await thrownBy(() => ownedForm(db, user, "too-much"))).toBeDefined();
	});

	it("still tells an account with forms why it stays, with no failure", async () => {
		const db = createDb(real);
		const { user } = await withOwnedForm(real, "keeps-account");

		const refused = (await refusedWith(() => deleteAccount(db, user))) as { status: number };

		expect(refused.status).toBe(409);
		expect(failures()).toEqual([]);
	});

	/** What an API call of Better Auth's was refused with: the status and the code of its error. */
	async function refusal(work: () => Promise<unknown>) {
		const error = (await thrownBy(work)) as {
			status?: unknown;
			body?: { code?: unknown; message?: unknown };
		};
		return { status: error?.status, code: error?.body?.code, message: error?.body?.message };
	}

	it("still tells an address that has an account from a failure, where anyone may sign up", async () => {
		const auth = createAuth({ db: createDb(real), secret, baseURL });
		await auth.api.signUpEmail({
			body: { name: "Dee", email: "dee@answers.test", password: PASSWORD },
		});

		const again = await refusal(() =>
			auth.api.signUpEmail({
				body: { name: "Dee again", email: "dee@answers.test", password: PASSWORD },
			}),
		);

		expect(again).toMatchObject({
			status: "UNPROCESSABLE_ENTITY",
			code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
		});
		expect(failures()).toEqual([]);
	});

	it("still answers a listed address that has an account as it answers an unlisted one", async () => {
		const listed = "eli@answers.test";
		const auth = createAuth({
			db: createDb(real),
			secret,
			baseURL,
			mayMakeAccount: (email) => email === listed,
			signUpClosed: true,
		});
		await auth.api.signUpEmail({ body: { name: "Eli", email: listed, password: PASSWORD } });

		const taken = await refusal(() =>
			auth.api.signUpEmail({ body: { name: "Eli again", email: listed, password: PASSWORD } }),
		);
		const unlisted = await refusal(() =>
			auth.api.signUpEmail({
				body: { name: "Fay", email: "fay@answers.test", password: PASSWORD },
			}),
		);

		expect(taken).toEqual({ status: "FORBIDDEN", code: "SIGN_UP_CLOSED", message: SIGN_UP_CLOSED });
		expect(unlisted).toEqual(taken);
		expect(failures()).toEqual([]);
	});
});

// What makes a database without a D1 binding to watch.
describe("without a database", () => {
	it("is left as Drizzle made it, so a deployment with no binding starts and says so", () => {
		expect(() => createDb(undefined as unknown as D1Database)).not.toThrow();
	});

	it("refuses a stand-in that is no binding, as the schema generator's once was", () => {
		expect(() => createDb({} as D1Database)).toThrow("Drizzle's session cannot be reached");
	});

	it("still loads the configuration the schema generator reads, whose database is no binding", async () => {
		const { auth } = await import("../auth/cli");

		expect(auth.options.emailAndPassword?.enabled).toBe(true);
		expect(auth.options.plugins?.length).toBeGreaterThan(0);
		await auth.$context;
		expect(logged()).not.toContain("Drizzle's session cannot be reached");
	});
});
