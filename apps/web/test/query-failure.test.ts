import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, authPost, newPerson, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

// A query of D1 that failed for good, in the Worker as it deploys. Drizzle's error for it is
// `Failed query: select … params: …`, with every value the statement was given. A page whose
// read failed showed it and had it in its HTML, with the form's id and the account's, and Better
// Auth logged the one for a session read, with the session's token, and the one for a sign-in,
// with the address. What a respondent sends is the value of most writes, so none of it may be
// in what a failure logs or answers. A table that is gone makes every query of it fail, as the
// database being down would.

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

const json = { "Content-Type": "application/json" };

interface Started {
	id: string;
	secret: string;
}

const bearer = ({ secret }: Started) => ({ Authorization: `Bearer ${secret}` });

function call(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
	return forms.fetch(
		`/api/owner/${path}`,
		as(cookie, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
	);
}

let made = 0;

/** A made-up form of a new person, open, that lets a finished response be taken back. */
async function openForm() {
	const person = newPerson();
	const cookie = await signUp(forms, person);
	const id = `failing-${++made}`;
	const definition = { ...plantForm(id), withdrawal: "until-closed" };
	expect((await call(cookie, "POST", "forms", { definition })).status).toBe(201);
	expect((await call(cookie, "POST", `forms/${id}/state`, { state: "open" })).status).toBe(200);
	const account = await forms.db
		.prepare("SELECT id FROM user WHERE email = ?")
		.bind(person.email)
		.first<{ id: string }>();
	const token = decodeURIComponent(/session_token=([^;]+)/.exec(cookie)?.[1] ?? "").split(".")[0];
	return { cookie, id, person, accountId: account?.id ?? "", token: token ?? "" };
}

async function start(form: string): Promise<Started & { seal: string }> {
	const response = await forms.fetch(`/api/forms/${form}/responses`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ device: "phone", ...(form === "home-baking" ? { consent: true } : {}) }),
	});
	expect(response.status).toBe(201);
	const started = (await response.json()) as Started;
	const row = await forms.db
		.prepare("SELECT secret_seal FROM response WHERE id = ?")
		.bind(started.id)
		.first<{ secret_seal: string }>();
	return { ...started, seal: row?.secret_seal ?? "" };
}

function save(started: Started, question: string, value: unknown): Promise<Response> {
	return forms.fetch(`/api/responses/${started.id}/progress`, {
		method: "POST",
		headers: { ...json, ...bearer(started) },
		body: JSON.stringify({ answer: { question, value, activeMs: 1200 } }),
	});
}

function keepApart(form: string, email: string): Promise<Response> {
	return forms.fetch(`/api/forms/${form}/detached`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ answers: { email } }),
	});
}

/** Runs `work` with a table out of reach, and puts it back. */
async function without<Result>(table: string, work: () => Promise<Result>): Promise<Result> {
	await forms.db.exec(`ALTER TABLE ${table} RENAME TO ${table}_gone`);
	try {
		return await work();
	} finally {
		await forms.db.exec(`ALTER TABLE ${table}_gone RENAME TO ${table}`);
	}
}

/** A request's answer while a table is out of reach, and everything the Worker logged for it. */
async function failing(table: string, request: () => Promise<Response>) {
	const from = forms.logs.length;
	const answer = await without(table, async () => {
		const response = await request();
		return { status: response.status, text: await response.text() };
	});
	const logs = forms.logs.slice(from);
	return {
		...answer,
		logged: logs.map((log) => log.message).join("\n"),
		/** What the Worker logged about failed queries: a kind, a reference and a statement each. */
		failures: logs.flatMap((log) => {
			const found = /d1: a query failed \((.+?)\), reference ([0-9a-f]{8})(?:: (.+))?$/.exec(
				log.message,
			);
			return found ? [{ kind: found[1], reference: found[2], statement: found[3] ?? "" }] : [];
		}),
	};
}

type Failing = Awaited<ReturnType<typeof failing>>;

/** Nothing of these is in what was answered or in what was logged, and no statement's values. */
function expectNothingOf({ text, logged }: Failing, ...values: string[]) {
	for (const value of values) {
		expect(value.length).toBeGreaterThan(5);
		expect(text).not.toContain(value);
		expect(logged).not.toContain(value);
	}
	for (const said of [text, logged]) {
		expect(said).not.toContain("Failed query");
		expect(said).not.toContain("params");
		expect(said).not.toContain("DrizzleQueryError");
	}
}

const gone = (table: string) => `D1_ERROR, SQLITE_ERROR, no such table: ${table}`;

/** The reference the error notice shows. */
const shownIn = (html: string) => /<code>([0-9a-f]{8})<\/code>/.exec(html)?.[1];

const RESPONDENT_500 = {
	error: "Something went wrong on our side. Your earlier answers are safe.",
};

const TYPED = "My neighbour Mx Example of 42 Sample Lane overwaters, I think";
const ADDRESS = "a-reader-of-results@example.test";

describe("a respondent's answer that could not be saved", () => {
	it("is in no log and no answer, is not stored, and is stored when the page sends it again", async () => {
		const { id } = await openForm();
		const started = await start(id);
		expect((await save(started, "light", { option: "some" })).status).toBe(200);

		const failed = await failing("answer", () => save(started, "note", TYPED));

		// What the page's queue takes for "could not save, try again": a failure of the
		// server's, not a refusal, which it would not send again.
		expect(failed.status).toBe(500);
		expect(JSON.parse(failed.text)).toEqual(RESPONDENT_500);
		expectNothingOf(failed, TYPED, started.secret, started.seal, started.id);
		// One line for the write that failed, sent once: the text, with the answer as `?4`.
		expect(failed.failures.map(({ kind }) => kind)).toEqual([gone("answer")]);
		expect(failed.failures[0]?.statement).toMatch(
			/^INSERT INTO answer \(.*\) SELECT \?1, \?2, \?3, \?4, .*; UPDATE response SET /,
		);
		expect(failed.logged).not.toContain("is sent again");
		expect(failed.logged).toContain("responses: DatabaseError");

		// Nothing says it was saved, and it was not.
		const read = async () => {
			const response = await forms.fetch(`/api/responses/${started.id}`, {
				headers: bearer(started),
			});
			const state = (await response.json()) as {
				answers: { questions: Record<string, { value: unknown; changes: number }> };
			};
			return state.answers.questions;
		};
		expect(Object.keys(await read())).toEqual(["light"]);
		// The queue sends the same answer again, and it is stored once, as given.
		expect((await save(started, "note", TYPED)).status).toBe(200);
		expect((await read()).note).toMatchObject({ value: TYPED, changes: 0 });
	});

	it("is in no log when the response itself cannot be read, and that is no 'no such response'", async () => {
		const { id } = await openForm();
		const started = await start(id);

		const failed = await failing("response", () => save(started, "note", TYPED));

		// Not the 404 a wrong address gets: the page would stop sending what it holds.
		expect(failed.status).toBe(500);
		expect(JSON.parse(failed.text)).toEqual(RESPONDENT_500);
		expectNothingOf(failed, TYPED, started.secret, started.seal, started.id);
		expect(failed.failures.map(({ kind }) => kind)).toEqual([gone("response")]);
		expect(failed.failures[0]?.statement).toMatch(/ from "response" where "response"\."id" = \?$/);
		expect((await save(started, "note", TYPED)).status).toBe(200);
	});
});

describe("what a form keeps apart that could not be stored", () => {
	it.each([
		["a form someone owns", async () => (await openForm()).id],
		["an example", async () => "home-baking"],
	])("is in no log and no answer, for %s", async (_which, form) => {
		const id = await form();
		const count = async () =>
			(
				await forms.db
					.prepare("SELECT count(*) AS n FROM detached_answer WHERE form_id = ?")
					.bind(id)
					.first<{ n: number }>()
			)?.n;
		const before = await count();

		const failed = await failing("detached_answer", () => keepApart(id, ADDRESS));

		expect(failed.status).toBe(500);
		expect(JSON.parse(failed.text)).toEqual(RESPONDENT_500);
		expectNothingOf(failed, ADDRESS);
		expect(failed.failures.map(({ kind }) => kind)).toEqual([gone("detached_answer")]);
		expect(failed.failures[0]?.statement).toMatch(/^insert into "?detached_answer"? /i);
		expect(await count()).toBe(before);
		expect((await keepApart(id, ADDRESS)).status).toBe(201);
		expect(await count()).toBe((before ?? 0) + 1);
	});
});

describe("a withdrawal that failed", () => {
	it("is in no log, leaves the answers where they were, and is done when asked again", async () => {
		const { id } = await openForm();
		const started = await start(id);
		expect((await save(started, "note", TYPED)).status).toBe(200);
		const withdraw = () =>
			forms.fetch(`/api/responses/${started.id}`, { method: "DELETE", headers: bearer(started) });

		const failed = await failing("answer", withdraw);

		expect(failed.status).toBe(500);
		expect(JSON.parse(failed.text)).toEqual(RESPONDENT_500);
		expectNothingOf(failed, TYPED, started.secret, started.seal, started.id);
		expect(failed.failures.map(({ kind }) => kind)).toEqual([gone("answer")]);
		expect(failed.failures[0]?.statement).toMatch(
			/^UPDATE definition SET withdrawn = withdrawn \+ 1/,
		);
		// The batch is one transaction: the count did not move, and the answer is there.
		const counted = async () =>
			(
				await forms.db
					.prepare("SELECT sum(withdrawn) AS n FROM definition WHERE form_id = ?")
					.bind(id)
					.first<{ n: number }>()
			)?.n;
		expect(await counted()).toBe(0);
		const kept = await forms.db
			.prepare("SELECT value FROM answer WHERE response_id = ?")
			.bind(started.id)
			.all();
		expect(kept.results).toEqual([{ value: JSON.stringify(TYPED) }]);

		expect((await withdraw()).status).toBe(200);
		expect(await counted()).toBe(1);
	});
});

describe("an export that failed", () => {
	it("puts no answer, no id and no session into the log or the answer", async () => {
		const { cookie, id, accountId, token, person } = await openForm();
		const started = await start(id);
		expect((await save(started, "note", TYPED)).status).toBe(200);
		expect((await keepApart(id, ADDRESS)).status).toBe(201);
		const file = (name: string) => () => call(cookie, "GET", `forms/${id}/export/${name}.csv`);
		expect(await (await file("responses")()).text()).toContain(TYPED);

		// The answers are read by hand, the responses and the form through Drizzle, and the
		// session by Better Auth.
		for (const table of ["answer", "response", "form", "session"]) {
			const failed = await failing(table, file("responses"));

			expect(failed.status).toBe(500);
			expect(JSON.parse(failed.text)).toEqual({ error: "Something went wrong on our side." });
			expectNothingOf(failed, TYPED, started.id, accountId, token, person.email);
			expect(failed.failures.map(({ kind }) => kind)).toEqual([gone(table)]);
			expect(failed.failures[0]?.statement).toMatch(/^select /i);
		}

		// What the form keeps apart is exported once it is closed and holds enough.
		for (let reader = 0; reader < 4; reader++) {
			expect((await keepApart(id, `reader-${reader}@example.test`)).status).toBe(201);
		}
		expect((await call(cookie, "POST", `forms/${id}/state`, { state: "closed" })).status).toBe(200);
		expect(await (await file("detached")()).text()).toContain(ADDRESS);
		const failed = await failing("detached_answer", file("detached"));
		expect(failed.status).toBe(500);
		expectNothingOf(failed, ADDRESS, accountId, token);
		expect(failed.failures.map(({ kind }) => kind)).toEqual([gone("detached_answer")]);
	});
});

describe("a page whose read of the database failed", () => {
	it("shows no statement and no values, and a reference that is in the log", async () => {
		const { cookie, id, accountId, token } = await openForm();
		const page = () => forms.fetch(`/forms/${id}`, as(cookie));
		expect((await page()).status).toBe(200);

		const failed = await failing("form", page);

		expect(failed.status).toBe(500);
		expectNothingOf(failed, accountId, token);
		expect(failed.text).not.toMatch(/select\b[^<]*\bfrom\b/i);
		expect(failed.text).not.toContain("owner_id");
		expect(failed.text).toContain("This page could not be loaded.");
		expect(failed.failures.length).toBeGreaterThan(0);
		for (const { kind } of failed.failures) expect(kind).toBe(gone("form"));
		expect(shownIn(failed.text)).toBeDefined();
		expect(failed.failures.map(({ reference }) => reference)).toContain(shownIn(failed.text));
	});

	it("shows a respondent as little, on the form's own page", async () => {
		const { id } = await openForm();
		expect((await forms.fetch(`/f/${id}`)).status).toBe(200);

		const failed = await failing("form", () => forms.fetch(`/f/${id}`));

		expect(failed.status).toBe(500);
		expectNothingOf(failed);
		expect(failed.text).not.toMatch(/select\b[^<]*\bfrom\b/i);
		expect(failed.text).not.toContain("definition_hash");
		expect(failed.text).toContain("This page could not be loaded.");
		expect(failed.failures.map(({ reference }) => reference)).toContain(shownIn(failed.text));
	});
});

describe("a session read that failed", () => {
	it("puts no token in the log or the page, and shows the reference of the read", async () => {
		const { cookie, id, token } = await openForm();
		expect(token.length).toBeGreaterThan(16);

		const failed = await failing("session", () => forms.fetch(`/forms/${id}`, as(cookie)));

		expect(failed.status).toBe(500);
		// Better Auth logs the failure it caught.
		expect(failed.logged).toContain("[Better Auth]");
		expectNothingOf(failed, token);
		expect(failed.text).toContain("This page could not be loaded.");
		expect(failed.failures.map(({ kind }) => kind)).toContain(gone("session"));
		// The log has the statement that failed, with a `?` where the token was.
		expect(failed.logged).toContain('where "session"."token" = ? limit ?');
		// Better Auth throws its own error for this, with the database's as the cause. The page
		// shows that one's reference.
		expect(shownIn(failed.text)).toBeDefined();
		expect(failed.failures.map(({ reference }) => reference)).toContain(shownIn(failed.text));
	});
});

describe("signing in and signing up while the database fails", () => {
	it("puts no address and no password in the log or the answer", async () => {
		const person = newPerson("failing");
		await signUp(forms, person);
		const credentials = { email: person.email, password: person.password };

		const signIn = await failing("user", () => authPost(forms, "/sign-in/email", credentials));
		expect(signIn.status).toBe(500);
		expectNothingOf(signIn, person.email, person.password);
		expect(signIn.failures.map(({ kind }) => kind)).toContain(gone("user"));
		expect(signIn.logged).toContain('where "user"."email" = ? limit ?');

		const other = newPerson("failing");
		const made = await failing("user", () => authPost(forms, "/sign-up/email", other));
		expect(made.status).toBe(500);
		expectNothingOf(made, other.email, other.password, other.name);
		expect(made.failures.map(({ kind }) => kind)).toContain(gone("user"));

		// With the table back, both are what they were.
		expect((await authPost(forms, "/sign-in/email", credentials)).status).toBe(200);
		expect((await authPost(forms, "/sign-up/email", other)).status).toBe(200);
	});
});

// A page opened by a link inside the app is not rendered on the server: its loader calls a
// server function, and the failure reaches the page as that function's error, of which only
// the message crosses.
describe("a server function whose read failed", () => {
	const assets = join(resolve(import.meta.dirname, ".."), "dist/server/assets");

	function serverFnUrl(name: string) {
		const resolver = readdirSync(assets).find((file) =>
			/^__23tanstack-start-server-fn-resolver-.*\.js$/.test(file),
		);
		const source = resolver ? readFileSync(join(assets, resolver), "utf8") : "";
		const id = new RegExp(
			`"([0-9a-f]{64})": \\{\\s*functionName: "${name}_createServerFn_handler"`,
		).exec(source)?.[1];
		if (!id) throw new Error(`No server function ${name} in the build`);
		return `/_serverFn/${id}`;
	}

	/** Calls a GET server function with one string, or with nothing, as the browser does. */
	function serverFn(name: string, cookie: string, data?: string) {
		// Seroval's JSON for `{ data }`.
		const value = data === undefined ? { t: 2, s: 1 } : { t: 1, s: data };
		const payload = JSON.stringify({
			t: { t: 10, i: 0, p: { k: ["data"], v: [value] }, o: 0 },
			f: 0,
			m: [],
		});
		return forms.fetch(`${serverFnUrl(name)}?payload=${encodeURIComponent(payload)}`, {
			headers: { "x-tsr-serverFn": "true", accept: "application/json", Cookie: cookie },
		});
	}

	it("answers the owner's page with the reference and nothing of the statement", async () => {
		const { cookie, id, accountId, token } = await openForm();
		const found = await (await serverFn("getOwnedForm", cookie, id)).text();
		expect(found).toContain("Plants at home");

		const failed = await failing("form", () => serverFn("getOwnedForm", cookie, id));

		// An error, which crosses as its message alone.
		expect(failed.text).toContain("$TSR/Error");
		expectNothingOf(failed, accountId, token);
		expect(failed.text).not.toContain("owner_id");
		expect(failed.text).not.toContain(id);
		expect(failed.failures.map(({ kind }) => kind)).toEqual([gone("form")]);
		expect(failed.text).toContain(
			`A database query failed (reference ${failed.failures[0]?.reference})`,
		);
	});

	it("keeps the reference of a failed session read, which is in the error's cause", async () => {
		const { cookie, token } = await openForm();

		const failed = await failing("session", () => serverFn("getUser", cookie));

		expect(failed.text).toContain("$TSR/Error");
		expectNothingOf(failed, token);
		const references = failed.failures.map(({ reference }) => reference);
		expect(references).toHaveLength(1);
		expect(failed.text).toContain(`Failed to get session (reference ${references[0]})`);
	});
});

describe("deleting an account while the database fails", () => {
	it("is a failure, never 'the password is not right', and the account stays", async () => {
		const person = newPerson("staying");
		const cookie = await signUp(forms, person);
		const remove = () => call(cookie, "DELETE", "account", { password: person.password });

		// Better Auth reads the password's hash from `account` to check what was typed.
		const failed = await failing("account", remove);

		expect(failed.status).toBe(500);
		expect(JSON.parse(failed.text)).toEqual({ error: "Something went wrong on our side." });
		expectNothingOf(failed, person.password, person.email);
		expect(failed.failures.map(({ kind }) => kind)).toContain(gone("account"));
		expect((await remove()).status).toBe(200);
	});
});

// Invariant 13: a missing form, someone else's and no session get the same "not found". A
// failing database must not tell them apart either: whoever is not the owner gets the same
// answer for a form that is there as for one that is not, whichever table is out of reach.
describe("the owner's side while the database fails", () => {
	/** A page without what differs between any two requests: the nonce, the scripts, the reference. */
	function essence(html: string, form: string): string {
		return html
			.replaceAll(form, "FORM")
			.replace(/nonce="[^"]*"/g, "")
			.replace(/<meta property="csp-nonce"[^>]*>/, "")
			.replace(/<script[\s\S]*?<\/script>/g, "")
			.replace(/<code>[0-9a-f]{8}<\/code>/g, "<code>REFERENCE</code>");
	}

	const MISSING = "no-such-form-at-all";
	const addresses = ["", "/settings", "/responses", "/detached"];
	const files = ["responses", "codebook", "detached"];

	it("answers a stranger the same for a form that is there and one that is not", async () => {
		const { cookie: owner, id } = await openForm();
		const stranger = await signUp(forms);
		await start(id);

		for (const table of ["form", "response", "answer", "definition", "detached_answer"]) {
			for (const address of addresses) {
				const there = await failing(table, () =>
					forms.fetch(`/forms/${id}${address}`, as(stranger)),
				);
				const missing = await failing(table, () =>
					forms.fetch(`/forms/${MISSING}${address}`, as(stranger)),
				);
				const where = `${table} ${address}`;
				expect(there.status, where).toBe(missing.status);
				expect(essence(there.text, id), where).toBe(essence(missing.text, MISSING));
				// The same statements failed for both, if any did.
				expect(
					there.failures.map(({ statement }) => statement),
					where,
				).toEqual(missing.failures.map(({ statement }) => statement));
			}
			for (const name of files) {
				const there = await failing(table, () =>
					call(stranger, "GET", `forms/${id}/export/${name}.csv`),
				);
				const missing = await failing(table, () =>
					call(stranger, "GET", `forms/${MISSING}/export/${name}.csv`),
				);
				expect(there.status, `${table} ${name}`).toBe(missing.status);
				expect(there.text, `${table} ${name}`).toBe(missing.text);
			}
		}
		// The owner's own page did load before and does after.
		expect((await forms.fetch(`/forms/${id}`, as(owner))).status).toBe(200);
	});

	it("answers a visitor who is not signed in as it does when the database is fine", async () => {
		const { id } = await openForm();
		const fine = await Promise.all(
			[id, MISSING].map(async (form) => {
				const page = await forms.fetch(`/forms/${form}`);
				const file = await forms.fetch(`/api/owner/forms/${form}/export/responses.csv`);
				return {
					page: { status: page.status, text: essence(await page.text(), form) },
					file: { status: file.status, text: await file.text() },
				};
			}),
		);
		expect(fine[0]).toEqual(fine[1]);

		for (const table of ["form", "session", "user"]) {
			for (const form of [id, MISSING]) {
				const page = await failing(table, () => forms.fetch(`/forms/${form}`));
				const file = await failing(table, () =>
					forms.fetch(`/api/owner/forms/${form}/export/responses.csv`),
				);
				expect({ status: page.status, text: essence(page.text, form) }, table).toEqual(
					fine[0]?.page,
				);
				expect({ status: file.status, text: file.text }, table).toEqual(fine[0]?.file);
				// Nobody signed in asks the database nothing.
				expect([...page.failures, ...file.failures], table).toEqual([]);
			}
		}
	});
});
