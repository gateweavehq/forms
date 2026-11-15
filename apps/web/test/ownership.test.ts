import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

/**
 * A form's results are its owner's alone. Every page and address of the owner's side is asked
 * here by three people who must not get in: someone signed in to another account, someone not
 * signed in, and (as the measure) the owner of a form that does not exist. All three must get
 * the same answer, so that nothing says whether a form is there.
 */

let forms: Forms;
let owner: string;
let stranger: string;
let responseId: string;

const FORM = "owned-plants";
const MISSING = "no-such-form";

beforeAll(async () => {
	forms = await startForms();
	owner = await signUp(forms);
	stranger = await signUp(forms);
	const created = await forms.fetch(
		"/api/owner/forms",
		as(owner, { method: "POST", body: JSON.stringify({ definition: plantForm(FORM) }) }),
	);
	expect(created.status).toBe(201);
	await forms.fetch(
		`/api/owner/forms/${FORM}/state`,
		as(owner, { method: "POST", body: JSON.stringify({ state: "open" }) }),
	);
	const started = await forms.fetch(`/api/forms/${FORM}/responses`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ device: "desk" }),
	});
	responseId = ((await started.json()) as { id: string }).id;
});
afterAll(() => forms.dispose());

/** What is left of a page once everything that differs between two requests is taken out. */
function essence(html: string, form: string): string {
	return html
		.replaceAll(form, "FORM")
		.replace(/nonce="[^"]*"/g, "")
		.replace(/<meta property="csp-nonce"[^>]*>/, "")
		.replace(/<script[\s\S]*?<\/script>/g, "");
}

const pages = [
	"",
	"/settings",
	"/questions",
	"/items",
	"/responses",
	"/responses/RESPONSE",
	"/detached",
];

describe.each(pages)("the page /forms/:form%s", (page) => {
	const at = (form: string) => `/forms/${form}${page.replace("RESPONSE", responseId)}`;

	it("is the owner's", async () => {
		expect((await forms.fetch(at(FORM), as(owner))).status).toBe(200);
	});

	it("is not found for another account and for nobody, exactly as a missing form is", async () => {
		const missing = await forms.fetch(at(MISSING), as(owner));
		expect(missing.status).toBe(404);
		const expected = essence(await missing.text(), MISSING);
		expect(expected).toContain("There is no such form");
		for (const cookie of [stranger, ""]) {
			const response = await forms.fetch(at(FORM), as(cookie));
			expect(response.status).toBe(404);
			const html = await response.text();
			expect(essence(html, FORM)).toBe(expected);
			expect(html).not.toContain("Plants at home");
		}
	});
});

const addresses: Array<[method: string, path: string, body?: unknown]> = [
	["POST", "forms/FORM/definition", { definition: plantForm(FORM, "Taken over") }],
	["POST", "forms/FORM/state", { state: "closed" }],
	["GET", "forms/FORM/export/responses.csv"],
	["GET", "forms/FORM/export/codebook.csv"],
	["GET", "forms/FORM/export/detached.csv"],
	["DELETE", "forms/FORM/responses/RESPONSE"],
	["DELETE", "forms/FORM/responses"],
];

describe.each(addresses)("%s /api/owner/%s", (method, path, body) => {
	const ask = (cookie: string, form: string) =>
		forms.fetch(
			`/api/owner/${path.replace("FORM", form).replace("RESPONSE", responseId)}`,
			as(cookie, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
		);

	it("is not found for another account and for nobody, exactly as a missing form is", async () => {
		const missing = await ask(owner, MISSING);
		expect(missing.status).toBe(404);
		const expected = await missing.text();
		for (const cookie of [stranger, ""]) {
			const response = await ask(cookie, FORM);
			expect(response.status).toBe(404);
			expect(await response.text()).toBe(expected);
		}
		// And nothing was changed by asking.
		const form = await forms.db.prepare("SELECT * FROM form WHERE id = ?").bind(FORM).first();
		expect(form).toMatchObject({ title: "Plants at home", state: "open" });
		const kept = await forms.db
			.prepare("SELECT count(*) AS n FROM response WHERE form_id = ?")
			.bind(FORM)
			.first<{ n: number }>();
		expect(kept?.n).toBe(1);
	});
});

describe("the addresses that name no form", () => {
	it.each(["preview", "forms", "examples"])(
		"POST /api/owner/%s is not found for nobody",
		async (path) => {
			const response = await forms.fetch(
				`/api/owner/${path}`,
				as("", { method: "POST", body: JSON.stringify({ definition: plantForm("nobody") }) }),
			);
			expect(response.status).toBe(404);
			const none = await forms.db.prepare("SELECT * FROM form WHERE id = 'nobody'").first();
			expect(none).toBeNull();
		},
	);
});
