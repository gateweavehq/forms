import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bakingForm } from "../../../packages/tally-import/test/baking-form";
import { as, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

let made = 0;
const freshId = () => `plants-${++made}`;

function call(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
	return forms.fetch(
		`/api/owner/${path}`,
		as(cookie, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
	);
}

/** Brings a made-up form in for a new person, and opens it unless told otherwise. */
async function ownerWithForm(state: "draft" | "open" = "open") {
	const cookie = await signUp(forms);
	const id = freshId();
	const created = await call(cookie, "POST", "forms", { definition: plantForm(id) });
	expect(created.status).toBe(201);
	if (state === "open") {
		expect((await call(cookie, "POST", `forms/${id}/state`, { state: "open" })).status).toBe(200);
	}
	return { cookie, id };
}

function start(id: string): Promise<Response> {
	return forms.fetch(`/api/forms/${id}/responses`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ device: "phone" }),
	});
}

async function formRow(id: string) {
	return forms.db.prepare("SELECT * FROM form WHERE id = ?").bind(id).first();
}

describe("bringing a form in", () => {
	it("says what a definition would become, and stores nothing", async () => {
		const cookie = await signUp(forms);
		const id = freshId();
		const response = await call(cookie, "POST", "preview", {
			kind: "definition",
			text: JSON.stringify(plantForm(id)),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			ok: true,
			summary: {
				id,
				title: "Plants at home",
				hasConsent: false,
				sections: [
					{ type: "questions", questions: 3 },
					{
						type: "repeat",
						questions: 2,
						groups: [
							{ title: "Leafy plants", items: 3 },
							{ title: "Succulents", items: 2 },
						],
					},
					{ type: "questions", questions: 2 },
				],
			},
			report: null,
		});
		expect(await formRow(id)).toBeNull();
	});

	it("names every problem of a definition that is not valid", async () => {
		const cookie = await signUp(forms);
		const broken = plantForm(freshId()) as { sections: unknown[]; title: unknown };
		broken.title = "";
		broken.sections = [];
		const response = await call(cookie, "POST", "preview", {
			kind: "definition",
			text: JSON.stringify(broken),
		});
		const result = (await response.json()) as { ok: boolean; problems: string[] };
		expect(result.ok).toBe(false);
		expect(result.problems.length).toBeGreaterThanOrEqual(2);
		const notJson = await call(cookie, "POST", "preview", { kind: "definition", text: "{" });
		expect(await notJson.json()).toMatchObject({ ok: false });
	});

	it("reads a Tally form's page and reports what it folded", async () => {
		const cookie = await signUp(forms);
		const response = await call(cookie, "POST", "preview", {
			kind: "tally",
			text: JSON.stringify(bakingForm()),
			id: freshId(),
		});
		const result = (await response.json()) as {
			ok: boolean;
			summary: { sections: Array<{ type: string }> };
			report: { source: { pages: number }; folded: Array<{ items: number }> };
		};
		expect(result.ok).toBe(true);
		expect(result.summary.sections.some((section) => section.type === "repeat")).toBe(true);
		expect(result.report.source.pages).toBeGreaterThan(1);
		expect(result.report.folded[0]?.items).toBeGreaterThan(1);
	});

	it("stores a form as a draft that belongs to the person who brought it in", async () => {
		const { id } = await ownerWithForm("draft");
		expect(await formRow(id)).toMatchObject({ id, title: "Plants at home", state: "draft" });
	});

	it("refuses a definition that is not valid, and an id that is taken in the same words for everyone", async () => {
		const { cookie, id } = await ownerWithForm();
		const invalid = await call(cookie, "POST", "forms", { definition: { id: "x" } });
		expect(invalid.status).toBe(400);
		const own = await call(cookie, "POST", "forms", { definition: plantForm(id) });
		const other = await call(await signUp(forms), "POST", "forms", { definition: plantForm(id) });
		expect(own.status).toBe(409);
		expect(other.status).toBe(409);
		expect(await other.text()).toBe(await own.text());
	});

	it("does not hand the answers left under an id to whoever takes it next", async () => {
		// A form whose account is gone leaves its responses behind.
		const { id } = await ownerWithForm();
		expect((await start(id)).status).toBe(201);
		await forms.db.prepare("DELETE FROM form WHERE id = ?").bind(id).run();
		const next = await signUp(forms);
		const taken = await call(next, "POST", "forms", { definition: plantForm(id) });
		expect(taken.status).toBe(409);
		expect(await formRow(id)).toBeNull();

		// The same for answers kept apart, and in the words an id in use gets.
		await forms.db
			.prepare("INSERT INTO detached_answer (id, form_id, answers) VALUES (7, 'left-behind', '{}')")
			.run();
		const kept = await call(next, "POST", "forms", { definition: plantForm("left-behind") });
		expect(kept.status).toBe(409);
		expect((await kept.text()).replaceAll("left-behind", id)).toBe(await taken.text());
	});

	it("refuses a rule nested without end, and never with a fault of its own", async () => {
		const cookie = await signUp(forms);
		const id = freshId();
		let rule: unknown = { question: "light", is: "bright" };
		for (let level = 0; level < 20_000; level++) rule = { not: rule };
		const deep = plantForm(id) as { sections: Array<{ questions?: Array<{ showIf?: unknown }> }> };
		const second = deep.sections[0]?.questions?.[1];
		if (!second) throw new Error("The form has no second question");
		second.showIf = rule;

		const previewed = await call(cookie, "POST", "preview", {
			kind: "definition",
			text: JSON.stringify(deep),
		});
		expect(previewed.status).toBe(200);
		const result = (await previewed.json()) as { ok: boolean; problems: string[] };
		expect(result.ok).toBe(false);
		expect(result.problems.join()).toContain("nested more than 32 levels");

		const created = await call(cookie, "POST", "forms", { definition: deep });
		expect(created.status).toBe(400);
		const asTally = await call(cookie, "POST", "preview", {
			kind: "tally",
			text: JSON.stringify({ blocks: [{ payload: rule }] }),
		});
		expect(asTally.status).toBe(200);
		expect(await asTally.json()).toMatchObject({ ok: false });
		expect(await formRow(id)).toBeNull();
	});

	it("refuses a question whose id the export needs for its own columns", async () => {
		const cookie = await signUp(forms);
		const id = freshId();
		const clashing = plantForm(id) as { sections: Array<{ questions?: Array<{ id: string }> }> };
		const second = clashing.sections[0]?.questions?.[1];
		if (!second) throw new Error("The form has no second question");
		second.id = "device";
		const created = await call(cookie, "POST", "forms", { definition: clashing });
		expect(created.status).toBe(400);
		expect(JSON.stringify(await created.json())).toContain("cannot be a question's id");
		expect(await formRow(id)).toBeNull();
	});

	it("refuses a definition too large to be stored as one row, before storing anything", async () => {
		const cookie = await signUp(forms);
		const id = freshId();
		const heavy = plantForm(id) as { sections: Array<{ text?: string[] }> };
		const [first] = heavy.sections;
		if (!first) throw new Error("The form has no section");
		first.text = ["long ".repeat(220_000)];
		const previewed = await call(cookie, "POST", "preview", {
			kind: "definition",
			text: JSON.stringify(heavy),
		});
		const result = (await previewed.json()) as { ok: boolean; problems: string[] };
		expect(result.ok).toBe(false);
		expect(result.problems.join()).toContain("a form can be at most 1000 KB");
		const created = await call(cookie, "POST", "forms", { definition: heavy });
		expect(created.status).toBe(400);
		expect(await formRow(id)).toBeNull();
		const rows = await forms.db
			.prepare("SELECT count(*) AS n FROM definition WHERE form_id = ?")
			.bind(id)
			.first<{ n: number }>();
		expect(rows?.n).toBe(0);

		// The same for a new definition of a form that exists.
		const own = await ownerWithForm();
		const replaced = await call(own.cookie, "POST", `forms/${own.id}/definition`, {
			definition: { ...heavy, id: own.id },
		});
		expect(replaced.status).toBe(400);
		expect(await formRow(own.id)).toMatchObject({ title: "Plants at home" });
	});

	it("takes nothing larger than a form can be", async () => {
		const cookie = await signUp(forms);
		const response = await call(cookie, "POST", "preview", {
			kind: "definition",
			text: "x".repeat(4_100_000),
		});
		expect(response.status).toBe(413);
	});
});

describe("a form's state", () => {
	it("is not answerable while a draft, and its page says so", async () => {
		const { id } = await ownerWithForm("draft");
		expect((await start(id)).status).toBe(404);
		const page = await forms.fetch(`/f/${id}`);
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain("not open yet");
		expect(html).not.toContain("How much light");
	});

	it("takes responses once open, and no new ones once closed", async () => {
		const { cookie, id } = await ownerWithForm();
		const begun = await start(id);
		expect(begun.status).toBe(201);
		const { id: responseId, secret } = (await begun.json()) as { id: string; secret: string };

		expect((await call(cookie, "POST", `forms/${id}/state`, { state: "closed" })).status).toBe(200);
		expect((await start(id)).status).toBe(403);
		expect(await (await forms.fetch(`/f/${id}`)).text()).toContain("closed");

		// Someone who had begun is not locked out of what they already gave.
		const finish = await forms.fetch(`/api/responses/${responseId}/complete`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
			body: "{}",
		});
		expect(finish.status).toBe(200);
	});

	it("refuses a state there is not", async () => {
		const { cookie, id } = await ownerWithForm();
		const response = await call(cookie, "POST", `forms/${id}/state`, { state: "archived" });
		expect(response.status).toBe(400);
	});

	it("cannot go back to a draft once it was opened, open or closed", async () => {
		const { cookie, id } = await ownerWithForm();
		const back = await call(cookie, "POST", `forms/${id}/state`, { state: "draft" });
		expect(back.status).toBe(400);
		expect(await formRow(id)).toMatchObject({ state: "open" });
		await call(cookie, "POST", `forms/${id}/state`, { state: "closed" });
		expect((await call(cookie, "POST", `forms/${id}/state`, { state: "draft" })).status).toBe(400);
		expect(await formRow(id)).toMatchObject({ state: "closed" });
		// Its link goes on saying what is true.
		expect(await (await forms.fetch(`/f/${id}`)).text()).not.toContain("not open yet");
	});
});

describe("who runs a form", () => {
	/** The made-up form as an import leaves it: without the line that says who runs it. */
	function unsigned(id: string) {
		const { controller: _controller, ...rest } = plantForm(id);
		return rest;
	}

	async function ownerWithUnsigned() {
		const cookie = await signUp(forms);
		const id = freshId();
		const created = await call(cookie, "POST", "forms", { definition: unsigned(id) });
		expect(created.status).toBe(201);
		return { cookie, id };
	}

	it("can be left out of a draft, which then cannot be opened, and says what is missing", async () => {
		const { cookie, id } = await ownerWithUnsigned();
		expect(await formRow(id)).toMatchObject({ state: "draft" });

		const opened = await call(cookie, "POST", `forms/${id}/state`, { state: "open" });
		expect(opened.status).toBe(409);
		expect(JSON.stringify(await opened.json())).toContain("does not say who runs it");
		expect(await formRow(id)).toMatchObject({ state: "draft" });
		expect((await start(id)).status).toBe(404);

		const settings = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		expect(settings).toContain("Missing: this form does not say who runs it yet.");
	});

	it("can be filled in on the settings page, as a new version, after which the form opens", async () => {
		const { cookie, id } = await ownerWithUnsigned();
		const before = (await formRow(id)) as { definition_hash: string };
		const saved = await call(cookie, "POST", `forms/${id}/controller`, {
			name: "  Made-up Fern Society ",
			contact: "ferns@example.test",
		});
		expect(saved.status).toBe(200);
		const after = (await formRow(id)) as { definition_hash: string };
		expect(after.definition_hash).not.toBe(before.definition_hash);
		const stored = await forms.db
			.prepare("SELECT json FROM definition WHERE hash = ?")
			.bind(after.definition_hash)
			.first<{ json: string }>();
		// Nothing else of the definition changed.
		expect(JSON.parse(stored?.json ?? "{}")).toEqual({
			...unsigned(id),
			controller: { name: "Made-up Fern Society", contact: "ferns@example.test" },
		});

		const settings = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		expect(settings).not.toContain("Missing: this form does not say who runs it yet.");
		expect(settings).toContain('value="Made-up Fern Society"');
		expect((await call(cookie, "POST", `forms/${id}/state`, { state: "open" })).status).toBe(200);
		expect(await (await forms.fetch(`/f/${id}`)).text()).toContain("Made-up Fern Society");
	});

	it("refuses a line that names nobody or gives no way to reach them", async () => {
		const { cookie, id } = await ownerWithUnsigned();
		const before = await formRow(id);
		for (const body of [
			{ name: "", contact: "ferns@example.test" },
			{ name: "Made-up Fern Society", contact: "   " },
			{ name: "Made-up Fern Society" },
			{ name: "x".repeat(201), contact: "ferns@example.test" },
		]) {
			expect((await call(cookie, "POST", `forms/${id}/controller`, body)).status).toBe(400);
		}
		expect(await formRow(id)).toEqual(before);
	});

	it("cannot be taken out of a form that is open", async () => {
		const { cookie, id } = await ownerWithForm();
		const before = await formRow(id);
		const replaced = await call(cookie, "POST", `forms/${id}/definition`, {
			definition: unsigned(id),
		});
		expect(replaced.status).toBe(409);
		expect(await formRow(id)).toEqual(before);

		// A closed form can lose it, and then cannot be opened again until it is back.
		await call(cookie, "POST", `forms/${id}/state`, { state: "closed" });
		expect(
			(await call(cookie, "POST", `forms/${id}/definition`, { definition: unsigned(id) })).status,
		).toBe(200);
		expect((await call(cookie, "POST", `forms/${id}/state`, { state: "open" })).status).toBe(409);
		expect(await formRow(id)).toMatchObject({ state: "closed" });
	});

	it("is said before a form is brought in", async () => {
		const cookie = await signUp(forms);
		const preview = async (definition: unknown) =>
			(await (
				await call(cookie, "POST", "preview", {
					kind: "definition",
					text: JSON.stringify(definition),
				})
			).json()) as { summary: { controller: unknown; withdrawal: string } };
		expect((await preview(plantForm(freshId()))).summary).toMatchObject({
			controller: { name: "Made-up Plant Study", contact: "plant-study@example.org" },
			withdrawal: "until-closed",
		});
		expect((await preview(unsigned(freshId()))).summary.controller).toBeNull();
		// A Tally form's page has no such line: the import still works, and comes in as a draft.
		const tally = (await (
			await call(cookie, "POST", "preview", {
				kind: "tally",
				text: JSON.stringify(bakingForm()),
				id: freshId(),
			})
		).json()) as { ok: boolean; summary: { controller: unknown } };
		expect(tally.ok).toBe(true);
		expect(tally.summary.controller).toBeNull();
	});
});

describe("a new definition", () => {
	it("is what new responses start under, while one already begun keeps its own", async () => {
		const { cookie, id } = await ownerWithForm();
		const before = (await (await start(id)).json()) as { id: string };
		const replaced = await call(cookie, "POST", `forms/${id}/definition`, {
			definition: plantForm(id, "Plants at home, second wording"),
		});
		expect(replaced.status).toBe(200);
		const after = (await (await start(id)).json()) as { id: string };

		const hashOf = async (responseId: string) =>
			(
				await forms.db
					.prepare("SELECT definition_hash FROM response WHERE id = ?")
					.bind(responseId)
					.first<{ definition_hash: string }>()
			)?.definition_hash;
		const row = await formRow(id);
		expect(row).toMatchObject({ title: "Plants at home, second wording" });
		expect(await hashOf(after.id)).toBe(row?.definition_hash);
		expect(await hashOf(before.id)).not.toBe(row?.definition_hash);

		const settings = await (await forms.fetch(`/forms/${id}/settings`, as(cookie))).text();
		expect(settings).toContain("Plants at home, second wording");
		expect(new Set(settings.match(/Version [0-9a-f]{8}/g)).size).toBe(2);
	});

	it("cannot carry another id", async () => {
		const { cookie, id } = await ownerWithForm();
		const response = await call(cookie, "POST", `forms/${id}/definition`, {
			definition: plantForm("another-id"),
		});
		expect(response.status).toBe(400);
		expect(await formRow("another-id")).toBeNull();
	});
});

describe("the example forms", () => {
	it("can be added to an account, once", async () => {
		const first = await signUp(forms);
		const added = await call(first, "POST", "examples");
		// Every example in examples/: two surveys of items and a short feedback form.
		expect(await added.json()).toEqual({ added: 3 });
		expect(await formRow("home-baking")).toMatchObject({ state: "open" });
		expect(await formRow("windowsill-herbs")).toMatchObject({ state: "open" });
		expect(await (await call(first, "POST", "examples")).json()).toEqual({ added: 0 });
		const second = await signUp(forms);
		expect(await (await call(second, "POST", "examples")).json()).toEqual({ added: 0 });
		expect(await (await forms.fetch("/forms", as(first))).text()).toContain("Bread at home");
	});
});

describe("an example that was answered while it was nobody's", () => {
	it("cannot be added to an account, and its answers stay out of reach", async () => {
		const fresh = await startForms();
		try {
			// Anyone can answer an example a server serves. Nobody owns it yet.
			const begun = await fresh.fetch("/api/forms/quick-feedback/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device: "phone" }),
			});
			expect(begun.status).toBe(201);
			const cookie = await signUp(fresh);
			const added = await fresh.fetch("/api/owner/examples", as(cookie, { method: "POST" }));
			// The examples nobody answered are added; this one is not.
			expect(await added.json()).toEqual({ added: 2 });
			const row = await fresh.db.prepare("SELECT id FROM form ORDER BY id").all();
			expect(row.results).toEqual([{ id: "home-baking" }, { id: "windowsill-herbs" }]);
			const results = await fresh.fetch("/forms/quick-feedback/responses", as(cookie));
			expect(results.status).toBe(404);
			const file = await fresh.fetch(
				"/api/owner/forms/quick-feedback/export/responses.csv",
				as(cookie),
			);
			expect(file.status).toBe(404);
		} finally {
			await fresh.dispose();
		}
	});
});

describe("two people bringing in the same id at once", () => {
	it("gives it to one, and tells the other it is taken", async () => {
		const id = freshId();
		const [first, second] = await Promise.all([signUp(forms), signUp(forms)]);
		const responses = await Promise.all(
			[first, second, first, second].map((cookie) =>
				call(cookie, "POST", "forms", { definition: plantForm(id) }),
			),
		);
		expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409]);
		const { results } = await forms.db.prepare("SELECT id FROM form WHERE id = ?").bind(id).all();
		expect(results).toHaveLength(1);
	});
});

describe("the owner's side", () => {
	it("lists a person's own forms and nobody else's", async () => {
		const mine = await ownerWithForm();
		const theirs = await ownerWithForm();
		const page = await (await forms.fetch("/forms", as(mine.cookie))).text();
		expect(page).toContain(`/forms/${mine.id}`);
		expect(page).not.toContain(`/forms/${theirs.id}`);
	});

	it("takes a change only from one of the app's own pages", async () => {
		const { cookie, id } = await ownerWithForm();
		const response = await forms.fetch(`/api/owner/forms/${id}/state`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.test" },
			body: JSON.stringify({ state: "closed" }),
		});
		expect(response.status).toBe(404);
		expect(await formRow(id)).toMatchObject({ state: "open" });
	});
});
