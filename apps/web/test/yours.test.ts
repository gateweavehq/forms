import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Forms, startForms } from "./forms-worker";

/** What a respondent can do about their own answers: take them back, and keep what they agreed to. */

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

async function start(form = "home-baking"): Promise<Started> {
	const response = await forms.fetch(`/api/forms/${form}/responses`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ device: "phone", ...(form === "home-baking" ? { consent: true } : {}) }),
	});
	expect(response.status).toBe(201);
	return (await response.json()) as Started;
}

const bearer = ({ secret }: Started) => ({ Authorization: `Bearer ${secret}` });

function withdraw(started: Started, headers: Record<string, string> = bearer(started)) {
	return forms.fetch(`/api/responses/${started.id}`, { method: "DELETE", headers });
}

async function count(table: string, column: string, id: string): Promise<number> {
	const row = await forms.db
		.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`)
		.bind(id)
		.first<{ n: number }>();
	return row?.n ?? -1;
}

describe("withdrawing", () => {
	it("deletes a response that is not complete, with its answers", async () => {
		const started = await start();
		const saved = await forms.fetch(`/api/responses/${started.id}/progress`, {
			method: "POST",
			headers: { ...json, ...bearer(started) },
			body: JSON.stringify({ answer: { question: "years", value: 4, activeMs: 900 } }),
		});
		expect(saved.status).toBe(200);
		expect(await count("answer", "response_id", started.id)).toBe(1);

		const response = await withdraw(started);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ withdrawn: true });
		expect(await count("response", "id", started.id)).toBe(0);
		expect(await count("answer", "response_id", started.id)).toBe(0);

		// It is gone for its own secret too.
		const again = await forms.fetch(`/api/responses/${started.id}`, { headers: bearer(started) });
		expect(again.status).toBe(404);
	});

	it("needs the response's secret, and says nothing about a response without it", async () => {
		const started = await start();
		const none = await withdraw(started, {});
		const wrong = await withdraw(started, { Authorization: "Bearer not-the-secret" });
		const missing = await withdraw({ id: "AAAAAAAAAAAAAAAA", secret: started.secret });
		expect(none.status).toBe(404);
		expect(wrong.status).toBe(404);
		expect(await wrong.text()).toBe(await missing.text());
		expect(await count("response", "id", started.id)).toBe(1);
	});

	it("is refused once the response is complete", async () => {
		const started = await start("quick-feedback");
		const headers = { ...json, ...bearer(started) };
		await forms.fetch(`/api/responses/${started.id}/progress`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				answer: { question: "found", value: { option: "yes" }, activeMs: 5 },
			}),
		});
		const done = await forms.fetch(`/api/responses/${started.id}/complete`, {
			method: "POST",
			headers,
			body: "{}",
		});
		expect(done.status).toBe(200);
		const response = await withdraw(started);
		expect(response.status).toBe(409);
		expect(await count("response", "id", started.id)).toBe(1);
		expect(await count("answer", "response_id", started.id)).toBe(1);
	});
});

describe("a copy of the consent", () => {
	it("is a page of its own with the text and the statement", async () => {
		const page = await forms.fetch("/f/home-baking/consent");
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain("This is a made-up survey about baking bread at home.");
		expect(html).toContain("I have read this and agree to take part.");
		expect(html).toContain("Print or save as PDF");
	});

	it("says so when a form has none, and is not found for a form there is not", async () => {
		const none = await forms.fetch("/f/quick-feedback/consent");
		expect(none.status).toBe(200);
		expect(await none.text()).toContain("This form has no consent text");
		expect((await forms.fetch("/f/nope/consent")).status).toBe(404);
	});

	it("is named by the response, so that it is the wording the person agreed to", async () => {
		const started = await start();
		const state = (await (
			await forms.fetch(`/api/responses/${started.id}`, { headers: bearer(started) })
		).json()) as { version: string };
		expect(state.version).toMatch(/^[0-9a-f]{64}$/);
		const page = await forms.fetch(`/f/home-baking/consent?v=${state.version}`);
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("I have read this and agree to take part.");
		// A version the form never had is not found. It used to show the current wording, which
		// under an id that was used again would pass another form's text off as what was agreed.
		const unknown = await forms.fetch(`/f/home-baking/consent?v=${"0".repeat(64)}`);
		expect(unknown.status).toBe(404);
		// What the page shows, without the data its script carries for the form's other pages.
		const shown = (await unknown.text()).replace(/<script[\s\S]*?<\/script>/g, "");
		expect(shown).not.toContain("I have read this and agree to take part.");
	});

	it("reads no cookie and sets none", async () => {
		const page = await forms.fetch("/f/home-baking/consent");
		expect(page.headers.getSetCookie()).toEqual([]);
	});
});
