import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	keepApartStatement,
	type Statement,
	startStatements,
	withdrawStatements,
} from "../src/server/statements";
import { as, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

/**
 * Taking answers back after finishing: with the address they were given from, for as long as
 * the form is open, when the form's rule says so. The server decides every part of it.
 */

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

let made = 0;

function call(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
	return forms.fetch(
		`/api/owner/${path}`,
		as(cookie, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
	);
}

/** A made-up form of a new person, open, under the rule given (the default when none is). */
async function openForm(withdrawal?: "until-closed" | "until-complete") {
	const cookie = await signUp(forms);
	const id = `take-back-${++made}`;
	const definition = { ...plantForm(id), ...(withdrawal ? { withdrawal } : {}) };
	expect((await call(cookie, "POST", "forms", { definition })).status).toBe(201);
	expect((await call(cookie, "POST", `forms/${id}/state`, { state: "open" })).status).toBe(200);
	return { cookie, id };
}

const bearer = ({ secret }: Started) => ({ Authorization: `Bearer ${secret}` });

async function start(form: string): Promise<Started> {
	const response = await forms.fetch(`/api/forms/${form}/responses`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ device: "phone", ...(form === "home-baking" ? { consent: true } : {}) }),
	});
	expect(response.status).toBe(201);
	return (await response.json()) as Started;
}

async function answer(started: Started, question: string, value: unknown): Promise<void> {
	const saved = await forms.fetch(`/api/responses/${started.id}/progress`, {
		method: "POST",
		headers: { ...json, ...bearer(started) },
		body: JSON.stringify({ answer: { question, value, activeMs: 1200 } }),
	});
	expect(saved.status).toBe(200);
}

async function complete(started: Started): Promise<{ canWithdraw: boolean }> {
	const done = await forms.fetch(`/api/responses/${started.id}/complete`, {
		method: "POST",
		headers: { ...json, ...bearer(started) },
		body: "{}",
	});
	expect(done.status).toBe(200);
	return (await done.json()) as { canWithdraw: boolean };
}

/** A response to this form with one answer, finished. */
async function finished(form: string): Promise<Started> {
	const started = await start(form);
	await answer(started, "count", 3);
	await complete(started);
	return started;
}

function withdraw(started: Started, headers: Record<string, string> = bearer(started)) {
	return forms.fetch(`/api/responses/${started.id}`, { method: "DELETE", headers });
}

async function state(started: Started): Promise<{ completed: boolean; canWithdraw: boolean }> {
	const response = await forms.fetch(`/api/responses/${started.id}`, { headers: bearer(started) });
	expect(response.status).toBe(200);
	return (await response.json()) as { completed: boolean; canWithdraw: boolean };
}

async function count(table: string, column: string, id: string): Promise<number> {
	const row = await forms.db
		.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`)
		.bind(id)
		.first<{ n: number }>();
	return row?.n ?? -1;
}

async function withdrawnCount(form: string): Promise<number[]> {
	const { results } = await forms.db
		.prepare("SELECT withdrawn FROM definition WHERE form_id = ? ORDER BY withdrawn")
		.bind(form)
		.all();
	return results.map((row: Record<string, unknown>) => Number(row.withdrawn));
}

const setState = (cookie: string, id: string, next: "open" | "closed") =>
	call(cookie, "POST", `forms/${id}/state`, { state: next });

describe("taking a finished response back", () => {
	it("deletes the response, its answers and their times while the form is open", async () => {
		const { id } = await openForm();
		const started = await finished(id);
		expect(await state(started)).toMatchObject({ completed: true, canWithdraw: true });
		expect(await count("answer", "response_id", started.id)).toBe(1);

		const response = await withdraw(started);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ withdrawn: true });
		expect(await count("response", "id", started.id)).toBe(0);
		expect(await count("answer", "response_id", started.id)).toBe(0);
		// Gone for its own secret too.
		const again = await forms.fetch(`/api/responses/${started.id}`, { headers: bearer(started) });
		expect(again.status).toBe(404);
	});

	it("is the default: a definition that does not say lets answers be taken back until it closes", async () => {
		const { id } = await openForm();
		const stored = await forms.db
			.prepare("SELECT json FROM definition WHERE form_id = ?")
			.bind(id)
			.first<{ json: string }>();
		expect(JSON.parse(stored?.json ?? "{}")).not.toHaveProperty("withdrawal");
		const started = await start(id);
		expect(await complete(started)).toEqual({ completed: true, canWithdraw: true });
	});

	it("can be done by anyone who has the address, once: a second device finds nothing left", async () => {
		const { id } = await openForm();
		const started = await finished(id);
		// Both devices hold the same address, and so the same secret.
		const [first, second] = [await withdraw(started), await withdraw(started)];
		expect(first.status).toBe(200);
		expect(second.status).toBe(404);
		expect(await withdrawnCount(id)).toEqual([1]);
	});

	it("ends when the form is closed, in the words a wrong secret and a missing response get", async () => {
		const { cookie, id } = await openForm();
		const started = await finished(id);
		expect((await setState(cookie, id, "closed")).status).toBe(200);
		expect(await state(started)).toMatchObject({ completed: true, canWithdraw: false });

		const closed = await withdraw(started);
		const wrong = await withdraw(started, { Authorization: "Bearer not-the-secret" });
		const missing = await withdraw({ id: "AAAAAAAAAAAAAAAA", secret: started.secret });
		expect(closed.status).toBe(404);
		const words = await closed.text();
		expect(words).toBe(await wrong.text());
		expect(words).toBe(await missing.text());
		const headers = (response: Response) =>
			[...response.headers].filter(([name]) => name !== "date").sort();
		expect(headers(closed)).toEqual(headers(wrong));
		expect(await count("response", "id", started.id)).toBe(1);
		expect(await count("answer", "response_id", started.id)).toBe(1);
		expect(await withdrawnCount(id)).toEqual([0]);

		// Open again, it takes answers again, and so lets them be taken back.
		expect((await setState(cookie, id, "open")).status).toBe(200);
		expect(await state(started)).toMatchObject({ canWithdraw: true });
		expect((await withdraw(started)).status).toBe(200);
		expect(await count("response", "id", started.id)).toBe(0);
	});

	it("still lets a response that is not finished be taken back on a closed form", async () => {
		const { cookie, id } = await openForm();
		const started = await start(id);
		await answer(started, "count", 2);
		await setState(cookie, id, "closed");
		expect(await state(started)).toMatchObject({ completed: false, canWithdraw: true });
		expect((await withdraw(started)).status).toBe(200);
		expect(await count("response", "id", started.id)).toBe(0);
	});

	it("is refused after finishing by a form whose rule is until-complete, open or not", async () => {
		const { id } = await openForm("until-complete");
		const started = await start(id);
		await answer(started, "count", 5);
		expect(await state(started)).toMatchObject({ canWithdraw: true });
		expect(await complete(started)).toEqual({ completed: true, canWithdraw: false });
		expect(await state(started)).toMatchObject({ canWithdraw: false });
		const response = await withdraw(started);
		expect(response.status).toBe(409);
		expect(await count("response", "id", started.id)).toBe(1);
		expect(await count("answer", "response_id", started.id)).toBe(1);
		expect(await withdrawnCount(id)).toEqual([0]);

		// Before finishing, it is taken back as ever.
		const other = await start(id);
		expect((await withdraw(other)).status).toBe(200);
	});

	it("goes by the rule the response began under, not the one the form has now", async () => {
		const { cookie, id } = await openForm();
		const promised = await finished(id);
		const replaced = await call(cookie, "POST", `forms/${id}/definition`, {
			definition: { ...plantForm(id), withdrawal: "until-complete" },
		});
		expect(replaced.status).toBe(200);
		const later = await finished(id);

		// Told "until the form closes" on the first page: that still holds.
		expect(await state(promised)).toMatchObject({ canWithdraw: true });
		expect((await withdraw(promised)).status).toBe(200);
		// Told "until you finish".
		expect(await state(later)).toMatchObject({ canWithdraw: false });
		expect((await withdraw(later)).status).toBe(409);
		expect(await withdrawnCount(id)).toEqual([0, 1]);
	});

	it("stays out of reach for a response begun under until-complete, when the form later says until-closed", async () => {
		const { cookie, id } = await openForm("until-complete");
		const told = await finished(id);
		// The form's rule is loosened. The person was told "until you finish", and a study that
		// counted on that keeps it for the responses it was said to.
		const replaced = await call(cookie, "POST", `forms/${id}/definition`, {
			definition: { ...plantForm(id), withdrawal: "until-closed" },
		});
		expect(replaced.status).toBe(200);
		expect(await state(told)).toMatchObject({ completed: true, canWithdraw: false });
		expect((await withdraw(told)).status).toBe(409);
		expect(await count("response", "id", told.id)).toBe(1);
		// A response begun since goes by the new rule.
		const later = await finished(id);
		expect(await state(later)).toMatchObject({ canWithdraw: true });
		expect((await withdraw(later)).status).toBe(200);
	});

	it("works for an example that belongs to nobody, which is open while it is served", async () => {
		const started = await start("home-baking");
		await answer(started, "years", 4);
		expect(await complete(started)).toEqual({ completed: true, canWithdraw: true });
		expect((await withdraw(started)).status).toBe(200);
		expect(await count("response", "id", started.id)).toBe(0);
	});

	it("is not offered for a response whose form is gone", async () => {
		const { id } = await openForm();
		const started = await finished(id);
		// As an account removed from the database leaves it: the form's row gone, its responses not.
		await forms.db.prepare("DELETE FROM form WHERE id = ?").bind(id).run();
		expect(await state(started)).toMatchObject({ canWithdraw: false });
		expect((await withdraw(started)).status).toBe(404);
		expect(await count("response", "id", started.id)).toBe(1);
	});
});

describe("what is left of a response that was taken back", () => {
	it("is a count on its version, and no row, id or time anywhere", async () => {
		const { cookie, id } = await openForm();
		const kept = await finished(id);
		const taken = await finished(id);
		const unfinished = await start(id);
		const before = await forms.db.prepare("SELECT * FROM form WHERE id = ?").bind(id).first();

		expect((await withdraw(taken)).status).toBe(200);
		expect((await withdraw(unfinished)).status).toBe(200);

		// Before or after finishing, it is one number: which of the two is not kept either.
		expect(await withdrawnCount(id)).toEqual([2]);
		// The form's row is as it was: its time of change would say when.
		expect(await forms.db.prepare("SELECT * FROM form WHERE id = ?").bind(id).first()).toEqual(
			before,
		);
		// Nothing in the database holds either id any more.
		const tables = await forms.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all();
		for (const name of tables.results.map((row: Record<string, unknown>) => String(row.name))) {
			// D1's own tables cannot be read, and hold nothing of the app's.
			if (name.startsWith("_") || name.startsWith("sqlite_")) continue;
			const { results } = await forms.db.prepare(`SELECT * FROM "${name}"`).all();
			const everything = JSON.stringify(results);
			expect(everything, name).not.toContain(taken.id);
			expect(everything, name).not.toContain(unfinished.id);
		}
		expect(await count("response", "id", kept.id)).toBe(1);

		// The owner is shown the number beside the version, and the counts without them.
		const settings = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		expect(settings).toContain("1 started, 1 completed");
		expect(settings).toContain('data-withdrawn="2"');
		expect(settings).toContain("2 taken back by the people who gave them");
		const list = await (await forms.fetch(`/forms/${id}/responses`, as(cookie))).text();
		expect(list).toContain(kept.id);
		expect(list).not.toContain(taken.id);
	});

	it("leaves what the form kept apart, which nothing connects to the response", async () => {
		const { id } = await openForm();
		const started = await finished(id);
		const sent = await forms.fetch(`/api/forms/${id}/detached`, {
			method: "POST",
			headers: json,
			body: JSON.stringify({ answers: { email: "reader@example.test" } }),
		});
		expect(sent.status).toBe(201);
		expect((await withdraw(started)).status).toBe(200);
		expect(await count("detached_answer", "form_id", id)).toBe(1);
	});

	it("says nothing of a version nobody withdrew from", async () => {
		const { cookie, id } = await openForm();
		await finished(id);
		const settings = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		expect(settings).not.toContain("data-withdrawn");
		expect(settings).not.toContain("taken back by");
	});
});

describe("what the pages say about taking answers back", () => {
	it("says on the first page which rule applies, who runs the form, and where to read what is stored", async () => {
		const open = await (await forms.fetch("/f/home-baking")).text();
		expect(open).toContain("also after you finish, for as long as this form is open");
		expect(open).toContain("Made-up Bread Study, Example Institute");
		expect(open).toContain('href="mailto:bread-study@example.org"');
		expect(open).toContain('href="/f/home-baking/stored"');

		const never = await (await forms.fetch("/f/quick-feedback")).text();
		expect(never).toContain("You can take your answers back yourself until you finish.");
		expect(never).not.toContain("for as long as this form is open");
	});

	it("says on a closed form's first page that it is over, and whom to ask", async () => {
		const { cookie, id } = await openForm();
		await setState(cookie, id, "closed");
		const page = await (await forms.fetch(`/f/${id}`)).text();
		expect(page).toContain("can no longer be taken back from their address");
		expect(page).not.toContain("for as long as this form is open");
		expect(page).toContain("Made-up Plant Study");
	});

	it("keeps the rule and who runs the form with the copy of the consent", async () => {
		const page = await (await forms.fetch("/f/home-baking/consent")).text();
		expect(page).toContain("also after you finish, for as long as this form is open");
		expect(page).toContain("Made-up Bread Study, Example Institute");
	});
});

/**
 * What no pair of real requests can be made to do on purpose: the other request first. The
 * server builds its statements from what it read; here they are built from the same reading
 * and run after the other request has changed what was read.
 */
describe("a statement that arrives after what it was decided on has changed", () => {
	async function run(statements: Statement[]): Promise<number[]> {
		const results = await forms.db.batch(
			statements.map(({ sql, params }) => forms.db.prepare(sql).bind(...params)),
		);
		return results.map((result: { meta: { changes?: number } }) => result.meta.changes ?? 0);
	}

	async function hashOf(responseId: string): Promise<string> {
		const row = await forms.db
			.prepare("SELECT definition_hash FROM response WHERE id = ?")
			.bind(responseId)
			.first<{ definition_hash: string }>();
		return row?.definition_hash ?? "";
	}

	it("withdraws nothing from a form that was closed after the server looked", async () => {
		const { cookie, id } = await openForm();
		const started = await finished(id);
		// What the server builds while the form is open: a complete response may go.
		const statements = withdrawStatements({
			responseId: started.id,
			definitionHash: await hashOf(started.id),
			afterCompletion: true,
		});
		expect((await setState(cookie, id, "closed")).status).toBe(200);

		expect(await run(statements)).toEqual([0, 0, 0]);
		expect(await count("response", "id", started.id)).toBe(1);
		expect(await count("answer", "response_id", started.id)).toBe(1);
		expect(await withdrawnCount(id)).toEqual([0]);

		// The same statements, with the form open again, do what they say.
		expect((await setState(cookie, id, "open")).status).toBe(200);
		expect(await run(statements)).toEqual([1, 1, 1]);
		expect(await count("response", "id", started.id)).toBe(0);
		expect(await withdrawnCount(id)).toEqual([1]);
	});

	it("withdraws nothing from a response that was completed after the server looked, when it may not go complete", async () => {
		const { id } = await openForm("until-complete");
		const started = await start(id);
		await answer(started, "count", 1);
		// Built while the response was unfinished, under a rule that lets go of nothing after.
		const statements = withdrawStatements({
			responseId: started.id,
			definitionHash: await hashOf(started.id),
			afterCompletion: false,
		});
		await complete(started);
		expect(await run(statements)).toEqual([0, 0, 0]);
		expect(await count("response", "id", started.id)).toBe(1);
		expect(await withdrawnCount(id)).toEqual([0]);
	});

	it("starts no response and keeps nothing apart for a form that was closed or deleted after the server looked", async () => {
		const begin = (formId: string, hash: string, responseId: string) =>
			startStatements({
				id: responseId,
				formId,
				hash,
				json: JSON.stringify(plantForm(formId)),
				answersVersion: 1,
				seal: "a-seal",
				device: "desk",
				now: 1,
			});
		const keep = (formId: string, key: number) =>
			keepApartStatement({ id: key, formId, answers: '{"email":"reader@example.test"}' });
		const currentHash = async (formId: string) =>
			(
				await forms.db
					.prepare("SELECT definition_hash AS hash FROM form WHERE id = ?")
					.bind(formId)
					.first<{ hash: string }>()
			)?.hash ?? "";

		// Closed in between.
		const closed = await openForm();
		const closedHash = await currentHash(closed.id);
		// While it is open, the statements do what they say.
		expect(await run(begin(closed.id, closedHash, "while-open-1"))).toEqual([0, 1]);
		expect(await run([keep(closed.id, 4711)])).toEqual([1]);
		await setState(closed.cookie, closed.id, "closed");
		expect(await run(begin(closed.id, closedHash, "after-close-1"))).toEqual([0, 0]);
		expect(await run([keep(closed.id, 4712)])).toEqual([0]);
		expect(await count("response", "form_id", closed.id)).toBe(1);
		expect(await count("detached_answer", "form_id", closed.id)).toBe(1);

		// Deleted in between: nothing is written under an id that is nobody's form.
		const deleted = await openForm();
		const deletedHash = await currentHash(deleted.id);
		const gone = await call(deleted.cookie, "DELETE", `forms/${deleted.id}`, {
			confirm: deleted.id,
		});
		expect(gone.status).toBe(200);
		expect(await run(begin(deleted.id, deletedHash, "after-delete-1"))).toEqual([0, 0]);
		expect(await run([keep(deleted.id, 4713)])).toEqual([0]);
		expect(await count("response", "form_id", deleted.id)).toBe(0);
		expect(await count("detached_answer", "form_id", deleted.id)).toBe(0);
		expect(await count("definition", "form_id", deleted.id)).toBe(0);
	});
});
