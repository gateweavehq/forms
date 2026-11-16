import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "../auth/config";
import { createResponse, findResponse, saveProgress, withdrawResponse } from "../responses";
import { keepApartStatement } from "../statements";
import { createDb, readRows, runBatch } from ".";
import { faulty, LOCAL, migratedD1 } from "./faulty-d1";
import { unownedForm, withOwnedForm } from "./made-up";
import { DatabaseError } from "./query-failure";
import { READ_ATTEMPTS, retryingReads } from "./retry-reads";

// A read of D1 that fails for a moment. Under load, the local runtime's D1 answered one read of
// a session with the error below, in Gateweave Agents' browser tests, and a signed-in person's
// page was a 500 that said "Failed to get session". The database here is a real one, with the
// failure put in front of it.

// `../forms` reads its settings from the Worker's runtime, which is not here.
vi.mock("cloudflare:workers", () => ({ env: {} }));

// A sign-up through Better Auth hashes a password, which takes over a second when nothing else
// runs and several beside the other suites, each with a local runtime of its own.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let real: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
	({ d1: real, dispose } = await migratedD1("retry-reads-test"));
});

afterAll(async () => {
	await dispose?.();
});

let warned: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warned = vi.spyOn(console, "warn").mockImplementation(() => {});
	// Better Auth logs a session read that failed for good, and `createDb` every failed query.
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function signedUp(d1: D1Database, email: string) {
	const auth = createAuth({
		db: createDb(d1),
		secret: "a-test-secret-that-is-long-enough-for-better-auth",
		baseURL: "https://forms.test",
	});
	const { headers } = await auth.api.signUpEmail({
		body: { name: "Rio", email, password: "a-long-test-password" },
		returnHeaders: true,
	});
	const cookie = headers
		.getSetCookie()
		.map((line) => line.split(";")[0])
		.join("; ");
	return { auth, cookie };
}

/** Everything `console.warn` was given, as one text. */
const logged = () =>
	warned.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");

const KEEP = "insert into detached_answer (id, form_id, answers) values (?, ?, ?)";

it("answers a session read that failed once", async () => {
	const { database, state } = faulty(real);
	const { auth, cookie } = await signedUp(database, "rio@example.com");

	state.sent.length = 0;
	state.failures = 1;
	const found = await auth.api.getSession({ headers: new Headers({ cookie }) });

	expect(found?.user.email).toBe("rio@example.com");
	expect(state.sent).toHaveLength(2);
	expect(warned).toHaveBeenCalledTimes(1);
});

it("gives up on a read that keeps failing, and answers the next one", async () => {
	const { database, state } = faulty(real);
	const { auth, cookie } = await signedUp(database, "sol@example.com");

	state.sent.length = 0;
	state.failures = READ_ATTEMPTS;
	await expect(auth.api.getSession({ headers: new Headers({ cookie }) })).rejects.toThrow(
		"Failed to get session",
	);
	expect(state.sent).toHaveLength(READ_ATTEMPTS);

	const found = await auth.api.getSession({ headers: new Headers({ cookie }) });
	expect(found?.user.email).toBe("sol@example.com");
});

describe("which failures are sent again", () => {
	// The texts Cloudflare's D1 error list answers with "Retry the operation", as D1 words them,
	// and the local runtime's.
	it.each([
		["connection-lost", "D1_ERROR: Network connection lost."],
		["storage-reset", "D1_ERROR: Internal error in D1 DB storage caused object to be reset."],
		[
			"storage-reset",
			"D1_ERROR: Internal error while starting up D1 DB storage caused object to be reset.",
		],
		["code-updated", "D1_ERROR: D1 DB reset because its code was updated."],
		["replica-disconnected", "D1_ERROR: Replica disconnected from primary."],
		["cannot-resolve", "D1_ERROR: Cannot resolve D1 DB due to transient issue on remote node."],
		["local-commit-token", LOCAL],
	])("a passing one (%s), logged by that name", async (label, message) => {
		const { database, state } = faulty(real);
		const d1 = retryingReads(database, { random: () => 0 });
		state.failures = 1;
		state.message = message;

		const rows = await d1.prepare("select ? as n").bind(7).all<{ n: number }>();

		expect(rows.results[0]?.n).toBe(7);
		expect(state.sent).toHaveLength(2);
		expect(logged()).toBe(`d1: a read failed (${label}) and is sent again (attempt 1)`);
	});

	it.each([
		["an overloaded database", "D1_ERROR: D1 DB is overloaded. Requests queued for too long."],
		["a full queue", "D1_ERROR: D1 DB is overloaded. Too many requests queued."],
		["too much CPU", "D1_ERROR: D1 DB exceeded its CPU time limit and was reset."],
		["too much memory", "D1_ERROR: D1 DB's isolate exceeded its memory limit and was reset."],
		[
			"a write that took too long",
			"D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.",
		],
		[
			"too large a result",
			"D1_ERROR: D1 query result exceeded the maximum response size limit of 50 MB",
		],
		["too many requests", "Too many API requests by single worker invocation."],
		// The list says to retry this one, but a resend cannot help a caller who left.
		["a caller who left", "D1_ERROR: Can't read from request stream because client disconnected."],
		["the wrong number of values", "D1_ERROR: Wrong number of parameter bindings for SQL query."],
		["a column that is not there", "D1_COLUMN_NOTFOUND: Column not found (missing)"],
		["one nobody knows", "D1_ERROR: something nobody has seen before"],
	])("not %s: thrown at once", async (_what, message) => {
		const { database, state } = faulty(real);
		const d1 = retryingReads(database, { random: () => 0 });
		state.failures = 1;
		state.message = message;

		await expect(d1.prepare("select 1").all()).rejects.toThrow(message);

		expect(state.sent).toHaveLength(1);
		expect(warned).not.toHaveBeenCalled();
	});

	it("not what SQLite refused, which it would refuse again", async () => {
		const { database, state } = faulty(real);
		const d1 = retryingReads(database);

		await expect(d1.prepare("select * from no_such_table").all()).rejects.toThrow("SQLITE_ERROR");

		expect(state.sent).toHaveLength(1);
		expect(warned).not.toHaveBeenCalled();
	});
});

it("logs nothing D1 said: its words can carry what a row held", async () => {
	const { database, state } = faulty(real);
	const d1 = retryingReads(database, { random: () => 0 });
	const typed = "what-someone-typed-into-a-form";
	const address = "someone@example.com";
	state.failures = 1;
	// As workerd words a body it could not read, with a passing failure's text inside it.
	state.message = `D1_ERROR: Failed to parse body as JSON, got: {"value":"${typed}","email":"${address}"} Network connection lost.`;

	await d1.prepare("select 1").all();

	expect(warned).toHaveBeenCalledTimes(1);
	expect(logged()).not.toContain(typed);
	expect(logged()).not.toContain(address);
	expect(logged()).toBe("d1: a read failed (connection-lost) and is sent again (attempt 1)");
});

it("sends a write once: it may have happened although its answer was lost", async () => {
	const { database, state } = faulty(real);
	const d1 = retryingReads(database);
	state.failures = 1;

	await expect(d1.prepare(KEEP).bind(1001, "once", "{}").run()).rejects.toThrow(LOCAL);

	expect(state.sent).toHaveLength(1);
	expect(warned).not.toHaveBeenCalled();
	// Sent again by hand, it is written once.
	await d1.prepare(KEEP).bind(1001, "once", "{}").run();
	const rows = await d1.prepare("select id from detached_answer where id = ?").bind(1001).all();
	expect(rows.results).toHaveLength(1);
});

it("sends a select once when another statement follows it, which may write", async () => {
	const { database, state } = faulty(real);
	const d1 = retryingReads(database);
	state.failures = 1;

	await expect(
		d1
			.prepare(
				"select 1; insert into detached_answer (id, form_id, answers) values (1002, 'two', '{}')",
			)
			.all(),
	).rejects.toThrow(LOCAL);

	expect(state.sent).toHaveLength(1);
	expect(warned).not.toHaveBeenCalled();
});

it("still sends again a select that only ends with a semicolon", async () => {
	const { database, state } = faulty(real);
	const d1 = retryingReads(database, { random: () => 0 });
	state.failures = 1;

	const rows = await d1.prepare("select 3 as n;\n").all<{ n: number }>();

	expect(rows.results[0]?.n).toBe(3);
	expect(state.sent).toHaveLength(2);
});

it("leaves a batch to the database as it was given", async () => {
	const d1 = retryingReads(real);
	const [one, two] = await d1.batch<{ n: number }>([
		d1.prepare("select ? as n").bind(1),
		d1.prepare("select ? as n").bind(2),
	]);
	expect([one?.results[0]?.n, two?.results[0]?.n]).toEqual([1, 2]);
});

describe("a session of the database", () => {
	it("has its reads sent again too, and its writes once", async () => {
		const { database, state } = faulty(real);
		const session = retryingReads(database, { random: () => 0 }).withSession("first-primary");

		state.failures = 1;
		const rows = await session.prepare("select ? as n").bind(5).all<{ n: number }>();
		expect(rows.results[0]?.n).toBe(5);
		expect(state.sent).toHaveLength(2);

		state.sent.length = 0;
		state.failures = 1;
		await expect(session.prepare(KEEP).bind(1003, "in-session", "{}").run()).rejects.toThrow(LOCAL);
		expect(state.sent).toHaveLength(1);
	});

	it("keeps its bookmark and its batch", async () => {
		const session = retryingReads(real).withSession("first-primary");
		const unwrapped = real.withSession("first-primary");
		expect(session.getBookmark()).toBe(unwrapped.getBookmark());

		const [one] = await session.batch<{ n: number }>([session.prepare("select ? as n").bind(9)]);
		expect(one?.results[0]?.n).toBe(9);

		await unwrapped.prepare("select 1").all();
		await session.prepare("select 1").all();
		expect(typeof session.getBookmark()).toBe(typeof unwrapped.getBookmark());
	});
});

// What Forms asks of D1 that the builders' plain selects do not cover, and what a resent read
// may and may not change: every decision that a read prepares is asked again by a write, and a
// write goes once.
describe("Forms' own statements", () => {
	it("sends again the reads it writes by hand, which begin with SELECT", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		await real.prepare(KEEP).bind(2001, "by-hand", '{"n":1}').run();
		const read = {
			sql: `SELECT answers
				FROM detached_answer WHERE form_id = ?1`,
			params: ["by-hand"],
		};

		state.failures = 2;
		expect(await readRows<{ answers: string }>(db, read)).toEqual([{ answers: '{"n":1}' }]);

		expect(state.sent).toHaveLength(3);
		expect(state.sent[0]).toMatch(/^SELECT answers\s+FROM detached_answer/);
		expect(warned).toHaveBeenCalledTimes(2);
	});

	it("checks a response's secret the same after a read that failed once, and takes no failure for a wrong one", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const started = await createResponse(db, await unownedForm("tea-secret"), "phone");

		state.failures = 1;
		expect((await findResponse(db, started.id, started.secret))?.id).toBe(started.id);
		state.failures = 1;
		expect(await findResponse(db, started.id, "not-the-secret")).toBeUndefined();

		// A read that failed for good is a failure, never "there is no such response": the page
		// would take that for an address that is wrong, and stop sending what it holds.
		state.failures = READ_ATTEMPTS;
		await expect(findResponse(db, started.id, started.secret)).rejects.toBeInstanceOf(
			DatabaseError,
		);
	});

	it("sends an answer's save once, although the failure is a passing one", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const form = await unownedForm("tea-saved");
		const started = await createResponse(db, form, "phone");
		const row = await findResponse(db, started.id, started.secret);
		if (!row) throw new Error("The response was not made");

		state.batches.length = 0;
		state.batchFailures = 1;
		state.message = "D1_ERROR: Network connection lost.";
		const progress = {
			answer: { question: "drink", value: { option: "yes" }, activeMs: 10 },
			position: "q:drink",
		};
		await expect(saveProgress(db, form.definition, row, progress)).rejects.toBeInstanceOf(
			DatabaseError,
		);

		expect(state.batches).toHaveLength(1);
		expect(warned).not.toHaveBeenCalled();
		// The page sends it again, and it is stored once and counted as no change.
		await saveProgress(db, form.definition, row, progress);
		const { results } = await real
			.prepare("select value, changes, active_ms from answer where response_id = ?")
			.bind(started.id)
			.all();
		expect(results).toEqual([{ value: '{"option":"yes"}', changes: 0, active_ms: 10 }]);
	});

	it("sends once the statements that ask again whether a form is open", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const { form } = await withOwnedForm(real, "asked-again");

		// Starting a response.
		state.batchFailures = 1;
		state.message = "D1_ERROR: Network connection lost.";
		await expect(createResponse(db, form, "desk")).rejects.toBeInstanceOf(DatabaseError);
		expect(state.batches).toHaveLength(1);
		expect(state.batches[0]?.[1]).toMatch(/^INSERT INTO response/);

		// What a form keeps apart.
		state.batches.length = 0;
		state.batchFailures = 1;
		const kept = keepApartStatement({ id: 2002, formId: "asked-again", answers: "{}" });
		await expect(runBatch(db, [kept])).rejects.toBeInstanceOf(DatabaseError);
		expect(state.batches).toEqual([[kept.sql]]);

		// The form is closed before the statements are sent again by hand: they ask again, and
		// store nothing, whatever the read before them had found.
		await real.prepare("update form set state = 'closed' where id = ?").bind("asked-again").run();
		expect(await runBatch(db, [kept])).toEqual([0]);
		await expect(createResponse(db, form, "desk")).rejects.toThrow("There is no such form.");
		expect(warned).not.toHaveBeenCalled();
	});

	it("sends a withdrawal once, and it asks again when it is sent by hand", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const { form } = await withOwnedForm(real, "taken-back");
		const started = await createResponse(db, form, "desk");
		const row = await findResponse(db, started.id, started.secret);
		if (!row) throw new Error("The response was not made");
		await real.prepare("update response set completed_at = 5 where id = ?").bind(started.id).run();
		const complete = { ...row, completedAt: 5 };

		state.batches.length = 0;
		state.batchFailures = 1;
		state.message = "D1_ERROR: Network connection lost.";
		await expect(withdrawResponse(db, form.definition, complete, form)).rejects.toBeInstanceOf(
			DatabaseError,
		);
		expect(state.batches).toHaveLength(1);
		expect(warned).not.toHaveBeenCalled();

		// The form closes in between. The page asks again, and the statements say no.
		await real.prepare("update form set state = 'closed' where id = ?").bind("taken-back").run();
		expect(await withdrawResponse(db, form.definition, complete, form)).toBe("closed");
		const kept = await real
			.prepare("select count(*) as n from response where id = ?")
			.bind(started.id)
			.first<{ n: number }>();
		expect(kept?.n).toBe(1);
	});
});

// Every query of the Worker goes through this, so a read that works must cost what it did.
describe("a read that works", () => {
	it("is sent once, waits for nothing and logs nothing", async () => {
		const { database, state } = faulty(real);
		const waits: number[] = [];
		const d1 = retryingReads(database, {
			sleep: async (milliseconds) => {
				waits.push(milliseconds);
			},
		});

		await d1.prepare("select ? as n").bind(1).all();
		await d1.prepare("select ? as n").bind(1).first();
		await d1.prepare("select ? as n").bind(1).raw();

		expect(state.sent).toHaveLength(3);
		expect(waits).toEqual([]);
		expect(warned).not.toHaveBeenCalled();
	});

	it("is one statement for a session and its person, through Better Auth", async () => {
		const { database, state } = faulty(real);
		const { auth, cookie } = await signedUp(database, "uma@example.com");

		state.sent.length = 0;
		const found = await auth.api.getSession({ headers: new Headers({ cookie }) });

		expect(found?.user.email).toBe("uma@example.com");
		expect(state.sent).toHaveLength(1);
	});

	it("is one statement for a response and its secret", async () => {
		const { database, state } = faulty(real);
		const db = createDb(database);
		const started = await createResponse(db, await unownedForm("tea-read"), "phone");

		state.sent.length = 0;
		await findResponse(db, started.id, started.secret);

		expect(state.sent).toHaveLength(1);
	});
});

describe("the waits between attempts", () => {
	/** The waits a read that failed twice asked for, in milliseconds, without waiting them. */
	async function failingTwice(random: () => number) {
		const { database, state } = faulty(real);
		const waits: number[] = [];
		const d1 = retryingReads(database, {
			random,
			sleep: async (milliseconds) => {
				waits.push(milliseconds);
			},
		});
		state.failures = 2;
		await d1.prepare("select 1").all();
		return waits;
	}

	it("are half as long at the least and half as long again at the most", async () => {
		expect(await failingTwice(() => 0)).toEqual([12.5, 50]);
		expect(await failingTwice(() => 0.5)).toEqual([25, 100]);
		expect(await failingTwice(() => 1)).toEqual([37.5, 150]);
	});

	it("differ from one read to the next", async () => {
		const drawn = [0.1, 0.9];
		expect(await failingTwice(() => drawn.shift() ?? 0)).toEqual([15, 140]);
	});
});
