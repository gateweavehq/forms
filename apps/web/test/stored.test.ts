import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OTHER_TABLES, respondentTables } from "../src/server/stored";
import { as, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

/**
 * The page that tells a respondent what is stored. It must not drift from the database: it is
 * compared here with the tables as the migrations made them.
 */

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

/** A table's columns in the database itself, by the names the app's schema gives them. */
async function columnsOf(table: string, as: string): Promise<string[]> {
	const names = await columnNames(table);
	expect(names.length).toBeGreaterThan(0);
	return names.map(
		(name) =>
			`${as}.${name.replace(/_([a-z])/g, (_match: string, letter: string) => letter.toUpperCase())}`,
	);
}

async function columnNames(table: string): Promise<string[]> {
	const { results } = await forms.db
		.prepare(`SELECT name FROM pragma_table_info('${table}')`)
		.all();
	return results.map((row: Record<string, unknown>) => String(row.name));
}

function described(html: string): string[] {
	return [...html.matchAll(/data-stored="([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("the page that says what is stored", () => {
	it("has a line in words for every column a response and its answers are stored in", async () => {
		// The baking form keeps an address apart, so all three tables are on its page.
		const page = await forms.fetch("/f/home-baking/stored");
		expect(page.status).toBe(200);
		const html = await page.text();
		const inDatabase = [
			...(await columnsOf("response", "response")),
			...(await columnsOf("answer", "answer")),
			...(await columnsOf("detached_answer", "detachedAnswer")),
		];
		expect(described(html).sort()).toEqual(inDatabase.sort());
		// Each in words: a column nobody has described is shown by its name, and marked.
		expect(html).not.toContain("data-undescribed");
	});

	it("accounts for every table of the database: on the page, or left off it for a stated reason", async () => {
		const { results } = await forms.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all();
		const inDatabase = results
			.map((row: Record<string, unknown>) => String(row.name))
			// SQLite's and D1's own tables, which cannot be read and hold nothing of the app's.
			.filter((name: string) => !name.startsWith("_") && !name.startsWith("sqlite_"));
		const onPage = respondentTables();
		// A table added by a migration is in neither list until someone decides which it is, and
		// writes down why. Until then this fails, and the page's "everything" is not yet true.
		const unaccounted = inDatabase.filter(
			(name: string) => !(name in onPage) && !(name in OTHER_TABLES),
		);
		expect(unaccounted).toEqual([]);
		// Nothing is in both, each reason says something, and the page's tables all exist.
		for (const name of Object.keys(onPage)) {
			expect(OTHER_TABLES, name).not.toHaveProperty(name);
			expect(inDatabase).toContain(name);
		}
		for (const reason of Object.values(OTHER_TABLES)) expect(reason.length).toBeGreaterThan(20);
		// And every table on the page is a section of it.
		const html = await (await forms.fetch("/f/home-baking/stored")).text();
		for (const pageName of Object.values(onPage)) {
			expect(html).toContain(`data-stored="${pageName}.`);
		}
		expect(Object.keys(onPage).sort()).toEqual(["answer", "detached_answer", "response"]);
	});

	it("says of the response's time of change everything that moves it", async () => {
		const html = await (await forms.fetch("/f/home-baking/stored")).text();
		expect(html).toContain(
			"When your response last changed: an answer given or changed, a move to another card, or finishing.",
		);
		// As the server does: a save that only moves the place, and completing, both move it.
		const started = (await (
			await forms.fetch("/api/forms/quick-feedback/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device: "desk" }),
			})
		).json()) as { id: string; secret: string };
		const headers = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${started.secret}`,
		};
		const updatedAt = async () =>
			(
				await forms.db
					.prepare("SELECT updated_at FROM response WHERE id = ?")
					.bind(started.id)
					.first<{ updated_at: number }>()
			)?.updated_at ?? 0;
		const begun = await updatedAt();
		await new Promise((resolve) => setTimeout(resolve, 5));
		await forms.fetch(`/api/responses/${started.id}/progress`, {
			method: "POST",
			headers,
			body: JSON.stringify({ position: "q:found" }),
		});
		const moved = await updatedAt();
		expect(moved).toBeGreaterThan(begun);
		await forms.fetch(`/api/responses/${started.id}/progress`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				answer: { question: "found", value: { option: "yes" }, activeMs: 1 },
			}),
		});
		await new Promise((resolve) => setTimeout(resolve, 5));
		const done = await forms.fetch(`/api/responses/${started.id}/complete`, {
			method: "POST",
			headers,
			body: "{}",
		});
		expect(done.status).toBe(200);
		expect(await updatedAt()).toBeGreaterThan(moved);
	});

	it("says who runs the form, what is not stored, and how long a deleted answer remains", async () => {
		const html = await (await forms.fetch("/f/home-baking/stored")).text();
		expect(html).toContain("Made-up Bread Study, Example Institute");
		expect(html).toContain('href="mailto:bread-study@example.org"');
		expect(html).toContain("Your network (IP) address");
		expect(html).toContain("Your name, unless a question asks for it");
		expect(html).toContain("phone, a tablet or a desk screen");
		expect(html).toContain("How long the question was on your screen");
		expect(html).toContain("history for up to 30 days");
		expect(html).toContain("also after you finish, for as long as this form is open");
		// What is kept apart, in no more words than the storage gives.
		expect(html).toContain("It is stored with nothing that names your response");
		expect(html).toContain("could still work out which row came with which response");
		expect(html).toContain("What this form keeps apart stays");
		// What the count of withdrawn responses tells whoever runs the form, and no less.
		expect(html).toContain("sees that a response is gone from their list");
		expect(html).toContain("may have looked at its answers before");
		expect(html).not.toContain("says neither who nor when");
		// What the log of a failed query holds, which `test/query-failure.test.ts` holds it to.
		expect(html).toContain("the kind of failure, a random reference, and the database command");
		expect(html).toContain("Your answers are not in that note");
	});

	it("leaves out what a form does not do", async () => {
		// No question of this form is kept apart, and its rule is until-complete.
		const html = await (await forms.fetch("/f/quick-feedback/stored")).text();
		expect(html).not.toContain("Kept apart from your answers");
		expect(html).not.toContain("detachedAnswer.");
		expect(html).toContain("You can take your answers back yourself until you finish.");
		expect(described(html)).toHaveLength(
			(await columnsOf("response", "r")).length + (await columnsOf("answer", "a")).length,
		);
	});

	it("is there for an open and a closed form, and for no draft and no form there is not", async () => {
		const cookie = await signUp(forms);
		const id = "stored-plants";
		const post = (path: string, body: unknown) =>
			forms.fetch(`/api/owner/${path}`, as(cookie, { method: "POST", body: JSON.stringify(body) }));
		expect((await post("forms", { definition: plantForm(id) })).status).toBe(201);
		const draft = await forms.fetch(`/f/${id}/stored`);
		expect(await draft.text()).not.toContain("Made-up Plant Study");
		await post(`forms/${id}/state`, { state: "open" });
		expect(await (await forms.fetch(`/f/${id}/stored`)).text()).toContain("Made-up Plant Study");
		await post(`forms/${id}/state`, { state: "closed" });
		expect(await (await forms.fetch(`/f/${id}/stored`)).text()).toContain("Made-up Plant Study");
		expect((await forms.fetch("/f/nope/stored")).status).toBe(404);
	});

	it("is not found under a version the form never had", async () => {
		// A link that names a version was made for that version. An id can be used again after
		// its form was deleted, and the old link must not show the new form's page as its own.
		const unknown = await forms.fetch(`/f/home-baking/stored?v=${"0".repeat(64)}`);
		expect(unknown.status).toBe(404);
		// What the page shows, without the data its script carries for the form's other pages.
		const shown = (await unknown.text()).replace(/<script[\s\S]*?<\/script>/g, "");
		expect(shown).not.toContain("Made-up Bread Study");
		expect(shown).not.toContain("What is stored");
	});

	it("reads no cookie and sets none", async () => {
		const page = await forms.fetch("/f/home-baking/stored");
		expect(page.headers.getSetCookie()).toEqual([]);
	});
});
