import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";

/**
 * The results of a form, read back through its owner's pages and exports after answering it
 * through the respondent's addresses. What the numbers must be is worked out in the comments.
 */

let forms: Forms;
let owner: string;

const FORM = "plants-results";
const json = { "Content-Type": "application/json" };

interface Started {
	id: string;
	secret: string;
}

function ownerCall(method: string, path: string, body?: unknown): Promise<Response> {
	return forms.fetch(
		`/api/owner/${path}`,
		as(owner, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
	);
}

async function start(device: string): Promise<Started> {
	const response = await forms.fetch(`/api/forms/${FORM}/responses`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ device }),
	});
	expect(response.status).toBe(201);
	return (await response.json()) as Started;
}

async function give(
	started: Started,
	question: string,
	value: unknown,
	item?: string,
	activeMs = 1000,
): Promise<void> {
	const response = await forms.fetch(`/api/responses/${started.id}/progress`, {
		method: "POST",
		headers: { ...json, Authorization: `Bearer ${started.secret}` },
		body: JSON.stringify({
			answer: { question, value, activeMs, ...(item ? { item } : {}) },
			position: item ? `i:${item}:${question}` : `q:${question}`,
		}),
	});
	expect(response.status).toBe(200);
}

async function complete(started: Started): Promise<void> {
	const response = await forms.fetch(`/api/responses/${started.id}/complete`, {
		method: "POST",
		headers: { ...json, Authorization: `Bearer ${started.secret}` },
		body: "{}",
	});
	expect(response.status).toBe(200);
}

const page = async (path: string) => {
	const response = await forms.fetch(`/forms/${FORM}${path}`, as(owner));
	expect(response.status).toBe(200);
	return response.text();
};

const exported = async (name: string, query = "") => {
	const response = await ownerCall("GET", `forms/${FORM}/export/${name}.csv${query}`);
	expect(response.status).toBe(200);
	return response;
};

/** The text of an element with this `data-testid`. React writes numbers between comments. */
function shown(html: string, testId: string): string {
	const found = html.match(new RegExp(`data-testid="${testId}"[^>]*>(.*?)</`));
	return (found?.[1] ?? "").replaceAll("<!-- -->", "");
}

let first: Started;
let second: Started;
let third: Started;

beforeAll(async () => {
	forms = await startForms();
	owner = await signUp(forms);
	expect((await ownerCall("POST", "forms", { definition: plantForm(FORM) })).status).toBe(201);
	expect((await ownerCall("POST", `forms/${FORM}/state`, { state: "open" })).status).toBe(200);

	// A phone: a lot of light, 3 plants, gave up on the fern and says why. Completed.
	first = await start("phone");
	await give(first, "light", { option: "bright" });
	await give(first, "count", 3);
	await give(first, "kept", { option: "gave-up" }, "fern");
	await give(first, "why", "It dried out, twice", "fern");
	await give(first, "kept", { option: "now" }, "pothos");
	await complete(first);

	// A desk: little light, 7 plants, has a fern. Completed.
	second = await start("desk");
	await give(second, "light", { option: "dim" });
	await give(second, "count", 7);
	await give(second, "kept", { option: "now" }, "fern");
	await complete(second);

	// A phone: a lot of light, and stopped there.
	third = await start("phone");
	await give(third, "light", { option: "bright" });

	// One address, left apart.
	const detached = await forms.fetch(`/api/forms/${FORM}/detached`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({ answers: { email: "reader@example.test" } }),
	});
	expect(detached.status).toBe(201);
});
afterAll(() => forms.dispose());

describe("the overview", () => {
	it("counts what was started and completed, and says its n", async () => {
		const html = await page("");
		expect(shown(html, "started")).toBe("3");
		expect(shown(html, "completed")).toBe("2");
		expect(html).toContain("Counting all 3 responses to this version.");
		// Two of three, as a whole percentage.
		expect(html).toContain("67%");
		// The one that is not complete last saved in the first section.
		expect(html).toContain("1 response was started and not completed.");
		// It answered the first question and no other, so that is where it stopped.
		const last = html.slice(html.indexOf("The last question each got to"));
		expect(last).toContain("How much light does your home get?");
	});

	it("counts only one kind of device when asked", async () => {
		const html = await page("?device=phone");
		expect(shown(html, "started")).toBe("2");
		expect(shown(html, "completed")).toBe("1");
		expect(html).toContain("Counting 2 of the 3 responses to this version.");
	});

	it("counts only those who gave one answer when asked", async () => {
		const html = await page("?q=light&o=dim");
		expect(shown(html, "started")).toBe("1");
		expect(html).toContain("Counting 1 of the 3 responses to this version.");
	});

	it("is never kept by a cache", async () => {
		const response = await forms.fetch(`/forms/${FORM}`, as(owner));
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
	});
});

describe("the questions", () => {
	it("shows each option's count out of those who answered", async () => {
		const html = await page("/questions");
		expect(html).toContain("How much light does your home get?");
		// Three answered: two "A lot", none "Some", one "Very little".
		expect(html).toContain("2 (67%)");
		expect(html).toContain("0 (0%)");
		expect(html).toContain("1 (33%)");
		// Two gave a number: 3 and 7, so the median and the mean are 5.
		expect(html).toContain("How many plants do you have?");
		expect(html).toMatch(/Median<\/dt><dd[^>]*>5</);
	});
});

describe("the items", () => {
	it("has a row for each item with its statuses, and the follow-ups under it", async () => {
		const html = await page("/items");
		for (const plant of ["Fern", "Pothos", "Monstera", "Aloe", "Jade plant"]) {
			expect(html).toContain(plant);
		}
		// The fern: one has it now, one gave up, so each is 1 of 2.
		const fern = html.match(/<tr[^>]*data-item="fern".*?<\/tr>/)?.[0] ?? "";
		expect(fern.match(/1 \(50%\)/g)?.length).toBe(2);
		expect(fern).toContain("0 (0%)");
		expect(html).toContain("Why did you give up on the Fern?");
		expect(html).toContain("It dried out, twice");
	});
});

describe("the responses", () => {
	it("lists every response, and opens one question by question", async () => {
		const list = await page("/responses");
		for (const { id } of [first, second, third]) expect(list).toContain(`data-response="${id}"`);
		const one = await page(`/responses/${first.id}`);
		expect(one).toContain("How much light does your home get?");
		expect(one).toContain("A lot");
		expect(one).toContain("Why did you give up on the Fern?");
		expect(one).toContain("It dried out, twice");
	});

	it("never shows what is kept apart beside a response", async () => {
		for (const path of ["", "/questions", "/items", "/responses", `/responses/${first.id}`]) {
			expect(await page(path), path).not.toContain("reader@example.test");
		}
	});

	it("answers not found for a response of another form", async () => {
		const other = await ownerCall("POST", "forms", { definition: plantForm("plants-other") });
		expect(other.status).toBe(201);
		const response = await forms.fetch(`/forms/plants-other/responses/${first.id}`, as(owner));
		expect(response.status).toBe(404);
		const removed = await ownerCall("DELETE", `forms/plants-other/responses/${first.id}`);
		expect(removed.status).toBe(404);
	});
});

describe("an answer that was taken back", () => {
	// A row the server's own removal did not catch: results must not depend on it having run.
	// The third response says it has a lot of light and nothing about any plant, so a reason
	// for giving up on the jade plant is an answer to a question it was never asked.
	const ESCAPED = "It lost every leaf";

	beforeAll(async () => {
		await forms.db
			.prepare(
				"INSERT INTO answer (response_id, question_id, item_id, value, active_ms, changes, updated_at) VALUES (?, 'why', 'jade', ?, 4000, 0, 1)",
			)
			.bind(third.id, JSON.stringify(ESCAPED))
			.run();
	});

	it("is on no results page and in no export", async () => {
		for (const path of ["", "/items", "/questions", "/responses", `/responses/${third.id}`]) {
			expect(await page(path), path).not.toContain(ESCAPED);
		}
		const text = await (await exported("responses")).text();
		expect(text).not.toContain(ESCAPED);
		// And its four seconds are not in the response's time: one answer at a second.
		expect(text.split("\r\n").find((line) => line.startsWith(`${third.id},`))).toMatch(
			/^[\w-]+,phone,[^,]+Z,,1,bright,/,
		);
	});

	it("goes from the server when the answer it hung on is changed, without finishing", async () => {
		const fourth = await start("tablet");
		await give(fourth, "kept", { option: "gave-up" }, "aloe");
		await give(fourth, "why", "Too much water", "aloe");
		expect(await (await exported("responses")).text()).toContain("Too much water");
		await give(fourth, "kept", { option: "now" }, "aloe");
		const left = await forms.db
			.prepare("SELECT question_id FROM answer WHERE response_id = ? AND item_id = 'aloe'")
			.bind(fourth.id)
			.all();
		expect(left.results).toEqual([{ question_id: "kept" }]);
		expect(await (await exported("responses")).text()).not.toContain("Too much water");
		expect(await page("/items")).not.toContain("Too much water");
		// Later tests count three responses.
		const removed = await ownerCall("DELETE", `forms/${FORM}/responses/${fourth.id}`);
		expect(removed.status).toBe(200);
	});
});

describe("the exports", () => {
	it("gives the responses as a file, one row each, with nothing kept apart", async () => {
		const response = await exported("responses");
		expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
		expect(response.headers.get("Content-Disposition")).toMatch(
			/^attachment; filename="plants-results-responses-[0-9a-f]{8}\.csv"$/,
		);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		// A byte-order mark first, so that a spreadsheet reads the file as UTF-8. Reading the
		// answer as text drops it, as tools that know about it do.
		expect(new Uint8Array(await (await exported("responses")).arrayBuffer()).slice(0, 3)).toEqual(
			new Uint8Array([0xef, 0xbb, 0xbf]),
		);
		const lines = (await response.text()).split("\r\n");
		expect(lines[0]).toBe(
			[
				"response,device,started,completed,active_seconds",
				"light,count,rooms.kitchen,rooms.bedroom,rooms.bath",
				"fern.kept,fern.why,pothos.kept,pothos.why,monstera.kept,monstera.why",
				"aloe.kept,aloe.why,jade.kept,jade.why,note",
			].join(","),
		);
		expect(lines).toHaveLength(5);
		const row = (id: string) => lines.find((line) => line.startsWith(`${id},`)) ?? "";
		// Five answers at a second each.
		expect(row(first.id)).toMatch(/^[\w-]+,phone,[^,]+Z,[^,]+Z,5,bright,3,,,,gave-up,/);
		expect(row(first.id)).toContain(',gave-up,"It dried out, twice",now,');
		expect(row(second.id)).toMatch(/,desk,[^,]+Z,[^,]+Z,3,dim,7,,,,now,,/);
		// Not completed: the fourth cell is empty.
		expect(row(third.id)).toMatch(/^[\w-]+,phone,[^,]+Z,,1,bright,/);
		expect(lines.join()).not.toContain("example.test");
	});

	it("gives a codebook with a row for each column", async () => {
		const text = await (await exported("codebook")).text();
		expect(text).toContain(
			"light,light,,single_choice,How much light does your home get?,bright = A lot; some = Some; dim = Very little",
		);
		expect(text).toContain(
			"fern.why,why,fern,short_text,Why did you give up on the Fern?,The text",
		);
		expect(text).not.toContain("email");
	});

	it("does not give what is kept apart while the form is open", async () => {
		// One address was left. Shown now, it could only be the response completed just before.
		const file = await ownerCall("GET", `forms/${FORM}/export/detached.csv`);
		expect(file.status).toBe(409);
		expect(await file.text()).not.toContain("example.test");
		expect(await page("/detached")).not.toContain("example.test");
	});
});

describe("a version", () => {
	it("has its own results, apart from the version before it", async () => {
		const before = (
			await forms.db
				.prepare("SELECT definition_hash AS hash FROM form WHERE id = ?")
				.bind(FORM)
				.first<{ hash: string }>()
		)?.hash;
		const replaced = await ownerCall("POST", `forms/${FORM}/definition`, {
			definition: plantForm(FORM, "Plants at home, reworded"),
		});
		expect(replaced.status).toBe(200);

		const current = await page("");
		expect(current).toContain("No responses yet.");
		expect(current).toContain("Counting all 0 responses to this version.");
		const earlier = await page(`?v=${before}`);
		expect(shown(earlier, "started")).toBe("3");
		expect((await (await exported("responses", `?v=${before}`)).text()).split("\r\n")).toHaveLength(
			5,
		);
		expect((await (await exported("responses")).text()).split("\r\n")).toHaveLength(2);
	});
});

describe("deleting", () => {
	const count = async (sql: string) => (await forms.db.prepare(sql).first<{ n: number }>())?.n;

	it("removes one response with its answers, and leaves the others", async () => {
		const removed = await ownerCall("DELETE", `forms/${FORM}/responses/${third.id}`);
		expect(removed.status).toBe(200);
		expect(await count(`SELECT count(*) AS n FROM response WHERE form_id = '${FORM}'`)).toBe(2);
		expect(await count(`SELECT count(*) AS n FROM answer WHERE response_id = '${third.id}'`)).toBe(
			0,
		);
		const again = await ownerCall("DELETE", `forms/${FORM}/responses/${third.id}`);
		expect(again.status).toBe(404);
	});

	it("says how much there is before removing all of it, and then removes it", async () => {
		const settings = await page("/settings");
		// Five answers and three. The form is open, so how many are kept apart is not said.
		expect(settings).toContain(
			"This form holds 2 responses with 8 answers. Answers kept apart, if there are any, are removed too",
		);
		expect(settings).not.toMatch(/\d+ answers? kept apart/);
		const removed = await ownerCall("DELETE", `forms/${FORM}/responses`);
		expect(removed.status).toBe(200);
		expect(await count(`SELECT count(*) AS n FROM response WHERE form_id = '${FORM}'`)).toBe(0);
		expect(
			await count(
				`SELECT count(*) AS n FROM answer WHERE response_id IN ('${first.id}', '${second.id}')`,
			),
		).toBe(0);
		expect(await count(`SELECT count(*) AS n FROM detached_answer WHERE form_id = '${FORM}'`)).toBe(
			0,
		);
		// The form and its link are still there.
		expect(await count(`SELECT count(*) AS n FROM form WHERE id = '${FORM}'`)).toBe(1);
	});
});

describe("a form that asks two things about each item", () => {
	// The third example: eleven herbs, a group of eight and one of three, and two status
	// questions for each ("have you grown it", "do you cook with it").
	const HERBS = "windowsill-herbs";
	let herbs: Forms;
	let cookie: string;

	beforeAll(async () => {
		herbs = await startForms();
		cookie = await signUp(herbs);
		const added = await herbs.fetch("/api/owner/examples", as(cookie, { method: "POST" }));
		expect(((await added.json()) as { added: number }).added).toBe(3);
		const answer = async (grown: string, cooked: string, why?: string) => {
			const begun = await herbs.fetch(`/api/forms/${HERBS}/responses`, {
				method: "POST",
				headers: json,
				body: JSON.stringify({ device: "phone" }),
			});
			const started = (await begun.json()) as Started;
			const give = (question: string, value: unknown) =>
				herbs.fetch(`/api/responses/${started.id}/progress`, {
					method: "POST",
					headers: { ...json, Authorization: `Bearer ${started.secret}` },
					body: JSON.stringify({ answer: { question, value, item: "basil", activeMs: 1000 } }),
				});
			expect((await give("grown", { option: grown })).status).toBe(200);
			expect((await give("cooked", { option: cooked })).status).toBe(200);
			if (why) expect((await give("gave-up-why", why)).status).toBe(200);
		};
		// Basil: grown now and cooked with often; given up on and cooked with often.
		await answer("now", "often");
		await answer("stopped", "often", "It bolted in a week");
	});
	afterAll(() => herbs.dispose());

	it("gives each of the two its own table, with every herb in both", async () => {
		const response = await herbs.fetch(`/forms/${HERBS}/items`, as(cookie));
		expect(response.status).toBe(200);
		const html = await response.text();
		const grown = html.match(
			/<div[^>]*data-status="grown".*?(?=<div[^>]*data-status="cooked")/s,
		)?.[0];
		const cooked = html.slice(html.indexOf('data-status="cooked"'));
		expect(grown).toContain("Have you grown … indoors?");
		expect(cooked).toContain("Do you cook with …?");
		// Eleven rows in each table.
		expect(grown?.match(/<tr[^>]*data-item=/g)).toHaveLength(11);
		expect(cooked.match(/<tr[^>]*data-item=/g)).toHaveLength(11);
		// Grown: one of two has it now, one gave up. Cooked with: both often.
		const row = (table: string) => table.match(/<tr[^>]*data-item="basil".*?<\/tr>/s)?.[0] ?? "";
		expect(row(grown ?? "").match(/1 \(50%\)/g)).toHaveLength(2);
		expect(row(cooked)).toContain("2 (100%)");
		// The follow-up belongs to the first question's answer, and is under its item.
		expect(html).toContain("It bolted in a week");
	});

	it("has a column for each of the two in the export, for every herb", async () => {
		const file = await herbs.fetch(`/api/owner/forms/${HERBS}/export/responses.csv`, as(cookie));
		const [header = "", ...rows] = (await file.text()).split("\r\n").filter(Boolean);
		expect(header).toContain("basil.grown,basil.cooked,basil.gave-up-why,parsley.grown,");
		expect(header.split(",").filter((name) => name.endsWith(".cooked"))).toHaveLength(11);
		expect(rows).toHaveLength(2);
		expect(rows.join()).toContain(",stopped,often,It bolted in a week,");
	});
});
