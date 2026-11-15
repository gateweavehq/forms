import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, authPost, newPerson, type Person, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

/** Deleting a form with everything under it, and an account once it has no forms. */

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

const json = { "Content-Type": "application/json" };
let made = 0;

function call(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
	return forms.fetch(
		`/api/owner/${path}`,
		as(cookie, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
	);
}

async function bringIn(cookie: string, state: "draft" | "open" = "open"): Promise<string> {
	const id = `to-delete-${++made}`;
	expect((await call(cookie, "POST", "forms", { definition: plantForm(id) })).status).toBe(201);
	if (state === "open") {
		expect((await call(cookie, "POST", `forms/${id}/state`, { state })).status).toBe(200);
	}
	return id;
}

/** One finished response with an answer, and a row kept apart. */
async function answerOnce(id: string): Promise<string> {
	const started = (await (
		await forms.fetch(`/api/forms/${id}/responses`, {
			method: "POST",
			headers: json,
			body: JSON.stringify({ device: "tablet" }),
		})
	).json()) as { id: string; secret: string };
	const headers = { ...json, Authorization: `Bearer ${started.secret}` };
	const saved = await forms.fetch(`/api/responses/${started.id}/progress`, {
		method: "POST",
		headers,
		body: JSON.stringify({ answer: { question: "count", value: 7, activeMs: 10 } }),
	});
	expect(saved.status).toBe(200);
	await forms.fetch(`/api/responses/${started.id}/complete`, {
		method: "POST",
		headers,
		body: "{}",
	});
	const kept = await forms.fetch(`/api/forms/${id}/detached`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ answers: { email: "reader@example.test" } }),
	});
	expect(kept.status).toBe(201);
	return started.id;
}

async function count(sql: string, ...values: string[]): Promise<number> {
	const row = await forms.db
		.prepare(`SELECT count(*) AS n FROM ${sql}`)
		.bind(...values)
		.first<{ n: number }>();
	return row?.n ?? -1;
}

/** How many rows each table holds under a form's id. */
async function under(id: string) {
	return {
		form: await count("form WHERE id = ?", id),
		definition: await count("definition WHERE form_id = ?", id),
		response: await count("response WHERE form_id = ?", id),
		answer: await count(
			"answer WHERE response_id IN (SELECT id FROM response WHERE form_id = ?)",
			id,
		),
		detached: await count("detached_answer WHERE form_id = ?", id),
	};
}

describe("deleting a form", () => {
	it("removes its responses, their answers, what it kept apart and every version, and nothing else", async () => {
		const cookie = await signUp(forms);
		const id = await bringIn(cookie);
		const other = await bringIn(cookie);
		const responseId = await answerOnce(id);
		await answerOnce(id);
		await answerOnce(other);
		// A second version, so that there are two definitions to remove.
		const replaced = await call(cookie, "POST", `forms/${id}/definition`, {
			definition: plantForm(id, "Plants at home, reworded"),
		});
		expect(replaced.status).toBe(200);
		expect(await under(id)).toEqual({
			form: 1,
			definition: 2,
			response: 2,
			answer: 2,
			detached: 2,
		});

		const deleted = await call(cookie, "DELETE", `forms/${id}`, { confirm: id });
		expect(deleted.status).toBe(200);
		expect(await deleted.json()).toEqual({ deleted: true });
		expect(await under(id)).toEqual({
			form: 0,
			definition: 0,
			response: 0,
			answer: 0,
			detached: 0,
		});
		expect(await count("answer WHERE response_id = ?", responseId)).toBe(0);
		// The person's other form is as it was.
		expect(await under(other)).toEqual({
			form: 1,
			definition: 1,
			response: 1,
			answer: 1,
			detached: 1,
		});

		// Its pages and its link are gone, for its owner too.
		expect((await forms.fetch(`/forms/${id}/settings`, as(cookie))).status).toBe(404);
		expect((await forms.fetch(`/f/${id}`)).status).toBe(404);
	});

	it("retires the id to the account that had it: nobody else can take it, ever", async () => {
		const owner = newPerson("retiring");
		const cookie = await signUp(forms, owner);
		const id = await bringIn(cookie);
		await answerOnce(id);
		expect((await call(cookie, "DELETE", `forms/${id}`, { confirm: id })).status).toBe(200);
		// The id and the account, and nothing else of the form.
		const retired = await forms.db
			.prepare("SELECT * FROM retired_form_id WHERE form_id = ?")
			.bind(id)
			.all();
		expect(retired.results).toHaveLength(1);
		expect(Object.keys(retired.results[0] ?? {}).sort()).toEqual(["form_id", "owner_id"]);

		// Someone else is told what anyone is told about an id that is in use, word for word.
		const stranger = await signUp(forms);
		const inUse = await bringIn(stranger);
		const refused = await call(stranger, "POST", "forms", { definition: plantForm(id) });
		const taken = await call(stranger, "POST", "forms", { definition: plantForm(inUse) });
		expect(refused.status).toBe(409);
		expect((await refused.text()).replaceAll(id, inUse)).toBe(await taken.text());
		expect(await under(id)).toMatchObject({ form: 0, definition: 0 });
		// An old link to the deleted form opens nothing.
		expect((await forms.fetch(`/f/${id}`)).status).toBe(404);

		// The account it belonged to can use it again, delete it again, and use it again.
		expect((await call(cookie, "POST", "forms", { definition: plantForm(id) })).status).toBe(201);
		expect((await call(cookie, "DELETE", `forms/${id}`, { confirm: id })).status).toBe(200);
		expect((await call(cookie, "POST", "forms", { definition: plantForm(id) })).status).toBe(201);
		expect((await call(cookie, "DELETE", `forms/${id}`, { confirm: id })).status).toBe(200);

		// With the account gone, the id belongs to nobody, and stays out of reach for good.
		const gone = await call(cookie, "DELETE", "account", { password: owner.password });
		expect(gone.status).toBe(200);
		expect(await count("retired_form_id WHERE form_id = ?", id)).toBe(1);
		const after = await call(stranger, "POST", "forms", { definition: plantForm(id) });
		expect(after.status).toBe(409);
		// Not even for someone who signs up with the same address.
		const again = await signUp(forms, owner);
		expect((await call(again, "POST", "forms", { definition: plantForm(id) })).status).toBe(409);
	});

	it("says in words that nothing was deleted when the database will not do it in one step", async () => {
		const cookie = await signUp(forms);
		const id = await bringIn(cookie);
		await answerOnce(id);
		const before = await under(id);
		// The database refusing the batch, as it does for one that is too large: a batch is one
		// transaction, so whatever makes it fail, nothing of it happened.
		await forms.db
			.prepare(
				`CREATE TRIGGER too_much BEFORE DELETE ON response
				BEGIN SELECT RAISE(ABORT, 'too much for one step'); END`,
			)
			.run();
		try {
			for (const path of [`forms/${id}`, `forms/${id}/responses`]) {
				const refused = await call(cookie, "DELETE", path, { confirm: id });
				expect(refused.status).toBe(503);
				const { error } = (await refused.json()) as { error: string };
				expect(error).toContain("nothing was deleted");
				expect(error).toContain("delete responses one at a time");
				expect(await under(id)).toEqual(before);
				expect(await count("retired_form_id WHERE form_id = ?", id)).toBe(0);
			}
		} finally {
			await forms.db.prepare("DROP TRIGGER too_much").run();
		}
		expect((await call(cookie, "DELETE", `forms/${id}`, { confirm: id })).status).toBe(200);
	});

	it("needs the form's id, typed, and deletes nothing without it", async () => {
		const cookie = await signUp(forms);
		const id = await bringIn(cookie);
		await answerOnce(id);
		const before = await under(id);
		for (const body of [
			{ confirm: "" },
			{ confirm: `${id}x` },
			{ confirm: "yes" },
			{},
			undefined,
		]) {
			const response = await call(cookie, "DELETE", `forms/${id}`, body);
			expect([400, 415]).toContain(response.status);
		}
		expect(await under(id)).toEqual(before);
	});

	it("says how much it will remove before it does, on the form's settings page", async () => {
		const cookie = await signUp(forms);
		const id = await bringIn(cookie);
		await answerOnce(id);
		await answerOnce(id);
		const open = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		// While the form is open, how many answers it keeps apart is not said, here either.
		expect(open).toContain(
			"It holds 2 responses with 2 answers, answers kept apart if there are any (how many is shown once the form is closed), and 1 version of its definition.",
		);
		expect(open).toContain(`Type the form&#x27;s id, ${id}, to confirm`);
		expect(open).toContain("Its id stays yours");
		await call(cookie, "POST", `forms/${id}/state`, { state: "closed" });
		const closed = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		expect(closed).toContain(
			"It holds 2 responses with 2 answers, 2 answers kept apart, and 1 version of its definition.",
		);
	});
});

describe("deleting an account", () => {
	async function account(): Promise<{ person: Person; cookie: string }> {
		const person = newPerson("leaver");
		return { person, cookie: await signUp(forms, person) };
	}

	const remove = (cookie: string, password: string, on: Forms = forms) =>
		on.fetch(
			"/api/owner/account",
			as(cookie, { method: "DELETE", body: JSON.stringify({ password }) }),
		);

	const userRows = (email: string, on: Forms = forms) =>
		on.db
			.prepare('SELECT count(*) AS n FROM "user" WHERE email = ?')
			.bind(email)
			.first<{ n: number }>()
			.then((row: { n: number } | null) => row?.n ?? -1);

	it("is refused while the account has a form, and the page says to delete the forms first", async () => {
		const { person, cookie } = await account();
		const id = await bringIn(cookie, "draft");
		const refused = await remove(cookie, person.password);
		expect(refused.status).toBe(409);
		expect(JSON.stringify(await refused.json())).toContain("Delete each form first");
		expect(await userRows(person.email)).toBe(1);
		expect(await under(id)).toMatchObject({ form: 1 });

		const page = await (await forms.fetch("/account", as(cookie))).text();
		expect(page).toContain("You have 1 form. Delete it first, under its Settings");
		expect(page).not.toContain("Delete my account");

		// With the form gone, it goes through.
		expect((await call(cookie, "DELETE", `forms/${id}`, { confirm: id })).status).toBe(200);
		expect(await (await forms.fetch("/account", as(cookie))).text()).toContain("Delete my account");
		expect((await remove(cookie, person.password)).status).toBe(200);
		expect(await userRows(person.email)).toBe(0);
	});

	it("removes the person, their password and their sessions, and signs the browser out", async () => {
		const { person, cookie } = await account();
		const user = await forms.db
			.prepare('SELECT id FROM "user" WHERE email = ?')
			.bind(person.email)
			.first<{ id: string }>();
		const id = user?.id ?? "";
		expect(await count("session WHERE user_id = ?", id)).toBe(1);
		expect(await count("account WHERE user_id = ?", id)).toBe(1);

		const deleted = await remove(cookie, person.password);
		expect(deleted.status).toBe(200);
		expect(await userRows(person.email)).toBe(0);
		expect(await count("session WHERE user_id = ?", id)).toBe(0);
		expect(await count("account WHERE user_id = ?", id)).toBe(0);
		// The browser is told to drop its session cookie, and the cookie opens nothing.
		const cleared = deleted.headers.getSetCookie().join("\n");
		expect(cleared).toMatch(/session_token=;/);
		expect(cleared).toMatch(/Max-Age=0/i);
		expect((await forms.fetch("/forms", as(cookie))).status).toBe(307);
		// The password went with the account.
		const again = await authPost(forms, "/sign-in/email", {
			email: person.email,
			password: person.password,
		});
		expect(again.status).toBe(401);
	});

	it("needs the account's current password: what a session can read is not enough", async () => {
		const { person, cookie } = await account();
		// The email address is on the account page for anyone who holds the session.
		for (const guess of [person.email, "not-the-password", `${person.password} `]) {
			const refused = await remove(cookie, guess);
			expect(refused.status).toBe(403);
			expect(JSON.stringify(await refused.json())).toContain("The password is not right");
		}
		// The shape the address used to be sent in is not taken at all.
		const old = await call(cookie, "DELETE", "account", { confirm: person.email });
		expect(old.status).toBe(400);
		expect((await call(cookie, "DELETE", "account", { password: "" })).status).toBe(400);
		expect((await call(cookie, "DELETE", "account")).status).toBe(415);
		expect(await userRows(person.email)).toBe(1);
		// The session still works: a wrong password signs nobody out.
		expect((await forms.fetch("/account", as(cookie))).status).toBe(200);
	});

	it("counts tries at the password with those at changing it, per account", async () => {
		const few = await startForms({ triesPerMinute: 3 });
		try {
			const person = newPerson("guessed");
			const cookie = await signUp(few, person);
			// One try went to changing the password, which asks for the same thing.
			const changed = await authPost(
				few,
				"/change-password",
				{ currentPassword: "a-wrong-guess", newPassword: "another-password-1" },
				cookie,
			);
			expect(changed.status).toBe(400);
			expect((await remove(cookie, "guess-one", few)).status).toBe(403);
			expect((await remove(cookie, "guess-two", few)).status).toBe(403);
			// The limit is reached: the right password is not even looked at.
			const limited = await remove(cookie, person.password, few);
			expect(limited.status).toBe(429);
			expect(JSON.stringify(await limited.json())).toContain("Too many tries");
			expect(await userRows(person.email, few)).toBe(1);
			// Another account's tries are its own.
			const other = newPerson("unhurried");
			const otherCookie = await signUp(few, other);
			expect((await remove(otherCookie, other.password, few)).status).toBe(200);
		} finally {
			await few.dispose();
		}
	});

	it("says that the address stays on the server's list of who may sign up", async () => {
		const { cookie } = await account();
		const page = await (await forms.fetch("/account", as(cookie))).text();
		expect(page).toContain("your address stays on that list");
		expect(page).toContain("Ask whoever runs the server to take it off");
	});

	it("is not found for nobody, and for a request that did not come from the app's pages", async () => {
		const { person, cookie } = await account();
		const missing = await call("", "DELETE", "forms/no-such-form", { confirm: "no-such-form" });
		const nobody = await remove("", person.password);
		expect(nobody.status).toBe(404);
		expect(await nobody.text()).toBe(await missing.text());
		const elsewhere = await forms.fetch("/api/owner/account", {
			method: "DELETE",
			headers: { ...json, Cookie: cookie, Origin: "https://evil.test" },
			body: JSON.stringify({ password: person.password }),
		});
		expect(elsewhere.status).toBe(404);
		expect(await userRows(person.email)).toBe(1);
	});

	it("leaves every other account alone", async () => {
		const leaver = await account();
		const stays = await account();
		const id = await bringIn(stays.cookie);
		expect((await remove(leaver.cookie, leaver.person.password)).status).toBe(200);
		// Another person's password does nothing for one's own session.
		expect((await remove(stays.cookie, `${leaver.person.password}!`)).status).toBe(403);
		expect(await userRows(stays.person.email)).toBe(1);
		expect(await under(id)).toMatchObject({ form: 1 });
		expect((await forms.fetch(`/forms/${id}/settings`, as(stays.cookie))).status).toBe(200);
	});
});
