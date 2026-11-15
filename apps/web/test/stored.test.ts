import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

	it("names no table a respondent's answers do not go into, and none that it leaves out", async () => {
		// Every table with a column that points at a response or holds answers. One that is
		// added later has to be put on the page, and into this list.
		const { results } = await forms.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all();
		const holding: string[] = [];
		for (const table of results.map((row: Record<string, unknown>) => String(row.name))) {
			// D1's own tables cannot be read, and hold nothing of the app's.
			if (table.startsWith("_") || table.startsWith("sqlite_")) continue;
			const columns = await columnNames(table);
			if (table === "response" || columns.some((name) => /response|answer/.test(name))) {
				holding.push(table);
			}
		}
		expect(holding.sort()).toEqual(["answer", "detached_answer", "response"]);
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

	it("reads no cookie and sets none", async () => {
		const page = await forms.fetch("/f/home-baking/stored");
		expect(page.headers.getSetCookie()).toEqual([]);
	});
});
