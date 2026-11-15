import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

/**
 * What a form keeps apart, and when its owner may read it. The owner watches responses arrive
 * with their times, so a list that grew beside them would say whose each row is.
 */

let forms: Forms;
let owner: string;

const FORM = "plants-apart";
const json = { "Content-Type": "application/json" };

function ownerCall(method: string, path: string, body?: unknown): Promise<Response> {
	return forms.fetch(
		`/api/owner/${path}`,
		as(owner, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
	);
}

const setState = async (state: "open" | "closed") => {
	const response = await ownerCall("POST", `forms/${FORM}/state`, { state });
	expect(response.status).toBe(200);
};

function leave(email: string, form = FORM): Promise<Response> {
	return forms.fetch(`/api/forms/${form}/detached`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ answers: { email } }),
	});
}

const page = async () => {
	const response = await forms.fetch(`/forms/${FORM}/detached`, as(owner));
	expect(response.status).toBe(200);
	return response.text();
};

const exported = () => ownerCall("GET", `forms/${FORM}/export/detached.csv`);

const address = (n: number) => `reader-${n}@example.test`;

async function stored(): Promise<number> {
	const row = await forms.db
		.prepare("SELECT count(*) AS n FROM detached_answer WHERE form_id = ?")
		.bind(FORM)
		.first<{ n: number }>();
	return row?.n ?? -1;
}

beforeAll(async () => {
	forms = await startForms();
	owner = await signUp(forms);
	expect((await ownerCall("POST", "forms", { definition: plantForm(FORM) })).status).toBe(201);
});
afterAll(() => forms.dispose());

describe("leaving something to be kept apart", () => {
	it("is taken only by a form that is open, and a draft or closed one answers as no form does", async () => {
		const missing = await leave(address(0), "no-such-form");
		expect(missing.status).toBe(404);
		const expected = await missing.text();

		const draft = await leave(address(0));
		expect(draft.status).toBe(404);
		expect(await draft.text()).toBe(expected);

		await setState("open");
		for (const n of [1, 2, 3, 4]) expect((await leave(address(n))).status).toBe(201);

		await setState("closed");
		const closed = await leave(address(0));
		expect(closed.status).toBe(404);
		expect(await closed.text()).toBe(expected);
		expect(await stored()).toBe(4);
	});
});

describe("how many are kept apart", () => {
	const settings = async () => {
		const response = await forms.fetch(`/forms/${FORM}/settings`, as(owner));
		expect(response.status).toBe(200);
		return response.text();
	};

	it("is not said while the form is open, on the page or in what the page was sent", async () => {
		await setState("open");
		const before = await settings();
		expect(before).toContain(
			"Answers kept apart, if there are any, are removed too: how many there are is shown once the form is closed.",
		);
		expect(before).not.toMatch(/\d+ answers? kept apart/);
		// The page's own data, which the browser gets beside the markup, has no number either.
		expect(before).not.toMatch(/detached[^a-z]{1,6}4/);
		// One more row changes nothing a watching owner could see.
		expect((await leave(address(9))).status).toBe(201);
		const after = await settings();
		const said = (html: string) => html.match(/This form holds[^<]*/g);
		expect(said(after)).toEqual(said(before));
		expect(said(after)?.length).toBeGreaterThan(0);
		expect(after).not.toMatch(/\d+ answers? kept apart/);
		await forms.db
			.prepare("DELETE FROM detached_answer WHERE form_id = ? AND answers LIKE '%reader-9@%'")
			.bind(FORM)
			.run();
		expect(await stored()).toBe(4);
	});

	it("is said once the form is closed, where deleting says what it removes", async () => {
		await setState("closed");
		expect(await settings()).toContain("and 4 answers kept apart.");
	});
});

describe("reading what is kept apart", () => {
	it("is not possible while there are fewer than five, and the page says how many are missing", async () => {
		const html = await page();
		expect(html).toContain("1 more is needed");
		expect(html).not.toContain("example.test");
		const file = await exported();
		expect(file.status).toBe(409);
		expect(await file.text()).not.toContain("example.test");
	});

	it("is not possible while the form is open, however many there are", async () => {
		await setState("open");
		expect((await leave(address(5))).status).toBe(201);
		expect(await stored()).toBe(5);
		const html = await page();
		expect(html).toContain("shown once the form is closed");
		expect(html).not.toContain("example.test");
		const file = await exported();
		expect(file.status).toBe(409);
		expect(await file.text()).not.toContain("example.test");
	});

	it("is possible once the form is closed with five, on the page and as a file", async () => {
		await setState("closed");
		const html = await page();
		for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(address(n));
		const file = await exported();
		expect(file.status).toBe(200);
		const lines = (await file.text()).replace("﻿", "").split("\r\n").filter(Boolean);
		expect(lines[0]).toBe("email");
		expect(lines.slice(1).sort()).toEqual([1, 2, 3, 4, 5].map(address));
	});

	it("comes in an order drawn anew on every read", async () => {
		const orders = new Set<string>();
		for (let reads = 0; reads < 12; reads++) {
			orders.add((await (await exported()).text()).replace("﻿", ""));
		}
		// Five rows have 120 orders. Twelve reads all alike would be one chance in 120 to the 11th.
		expect(orders.size).toBeGreaterThan(1);
		const pages = new Set<string>();
		for (let reads = 0; reads < 12; reads++) {
			pages.add((await page()).match(/reader-\d@example\.test/g)?.join() ?? "");
		}
		expect(pages.size).toBeGreaterThan(1);
	});
});
