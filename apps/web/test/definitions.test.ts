import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Forms, startForms } from "./forms-worker";

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

interface Started {
	id: string;
	secret: string;
}

function post(path: string, body: unknown, started?: Started) {
	return forms.fetch(path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(started ? { Authorization: `Bearer ${started.secret}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function start(): Promise<Started> {
	const response = await post("/api/forms/quick-feedback/responses", { device: "desk" });
	expect(response.status).toBe(201);
	return (await response.json()) as Started;
}

async function read(started: Started) {
	const response = await forms.fetch(`/api/responses/${started.id}`, {
		headers: { Authorization: `Bearer ${started.secret}` },
	});
	expect(response.status).toBe(200);
	return (await response.json()) as {
		answers: { questions: Record<string, { value: unknown }> };
		formChanged: boolean;
		definition: { sections: Array<{ questions: Array<{ label: string }> }> } | null;
	};
}

const found = (option: string) => ({
	answer: { question: "found", value: { option }, activeMs: 100 },
});

/**
 * Makes a response one that began before the form was edited: its definition is the form as it
 * was then, in which the first question read differently and "Partly" was still "Somewhat".
 */
async function startedOnEarlierForm(): Promise<Started> {
	const started = await start();
	const row = await forms.db
		.prepare(
			"SELECT d.json FROM response r JOIN definition d ON d.hash = r.definition_hash WHERE r.id = ?",
		)
		.bind(started.id)
		.first<{ json: string }>();
	const earlier = JSON.parse(row?.json ?? "{}");
	const [question] = earlier.sections[0].questions;
	question.label = "Did you find it?";
	question.options[1] = { id: "somewhat", label: "Somewhat" };
	await forms.db.batch([
		forms.db
			.prepare("INSERT OR IGNORE INTO definition (hash, form_id, json) VALUES (?, ?, ?)")
			.bind("earlier", "quick-feedback", JSON.stringify(earlier)),
		forms.db
			.prepare("UPDATE response SET definition_hash = ? WHERE id = ?")
			.bind("earlier", started.id),
	]);
	return started;
}

describe("the definition a response started under", () => {
	it("is stored once, however many responses start on it", async () => {
		const [one, two] = [await start(), await start()];
		const found = await forms.db
			.prepare("SELECT definition_hash, answers_version FROM response WHERE id IN (?, ?)")
			.bind(one.id, two.id)
			.all();
		const results = found.results as Array<{ definition_hash: string; answers_version: number }>;
		expect(results.map((row) => row.answers_version)).toEqual([1, 1]);
		expect(results[0]?.definition_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(results[1]?.definition_hash).toBe(results[0]?.definition_hash);
		const kept = await forms.db
			.prepare("SELECT form_id, json FROM definition WHERE hash = ?")
			.bind(results[0]?.definition_hash)
			.all<{ form_id: string; json: string }>();
		expect(kept.results).toHaveLength(1);
		expect(kept.results[0]?.form_id).toBe("quick-feedback");
		expect(JSON.parse(kept.results[0]?.json ?? "{}")).toMatchObject({
			id: "quick-feedback",
			title: "Two questions about this page",
		});
	});

	it("is not sent with a response whose form has not changed", async () => {
		const response = await read(await start());
		expect(response).toMatchObject({ formChanged: false, definition: null });
	});

	it("is what an open response is checked against after its form has changed", async () => {
		const started = await startedOnEarlierForm();
		// The option the person saw, which today's form no longer has, is still theirs to give.
		expect(
			(await post(`/api/responses/${started.id}/progress`, found("somewhat"), started)).status,
		).toBe(200);
		// And an option that only today's form has was never offered to them.
		expect(
			(await post(`/api/responses/${started.id}/progress`, found("partly"), started)).status,
		).toBe(400);
		expect((await read(started)).answers.questions.found?.value).toEqual({ option: "somewhat" });
	});

	it("is sent along, so that the page asks the questions the person began with", async () => {
		const response = await read(await startedOnEarlierForm());
		expect(response.formChanged).toBe(true);
		expect(response.definition?.sections[0]?.questions[0]?.label).toBe("Did you find it?");
	});

	it("decides what completing needs, too", async () => {
		const started = await startedOnEarlierForm();
		const early = await post(`/api/responses/${started.id}/complete`, {}, started);
		expect(early.status).toBe(422);
		await post(`/api/responses/${started.id}/progress`, found("somewhat"), started);
		const done = await post(`/api/responses/${started.id}/complete`, {}, started);
		expect(done.status).toBe(200);
	});

	it("cannot be removed while a response points at it", async () => {
		const started = await start();
		const row = await forms.db
			.prepare("SELECT definition_hash FROM response WHERE id = ?")
			.bind(started.id)
			.first<{ definition_hash: string }>();
		await expect(
			forms.db.prepare("DELETE FROM definition WHERE hash = ?").bind(row?.definition_hash).run(),
		).rejects.toThrow();
	});
});
