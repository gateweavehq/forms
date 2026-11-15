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
		expect(await added.json()).toEqual({ added: 2 });
		expect(await formRow("home-baking")).toMatchObject({ state: "open" });
		expect(await (await call(first, "POST", "examples")).json()).toEqual({ added: 0 });
		const second = await signUp(forms);
		expect(await (await call(second, "POST", "examples")).json()).toEqual({ added: 0 });
		expect(await (await forms.fetch("/forms", as(first))).text()).toContain("Bread at home");
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
