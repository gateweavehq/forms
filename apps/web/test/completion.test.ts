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

type Answers = Record<string, { value: unknown; activeMs: number; changes: number }>;

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
	const response = await post("/api/forms/home-baking/responses", {
		device: "phone",
		consent: true,
	});
	return (await response.json()) as Started;
}

async function save(started: Started, question: string, value: unknown, item?: string) {
	const response = await post(
		`/api/responses/${started.id}/progress`,
		{ answer: { question, value, activeMs: 500, ...(item ? { item } : {}) } },
		started,
	);
	expect(response.status).toBe(200);
}

async function read(started: Started) {
	const response = await forms.fetch(`/api/responses/${started.id}`, {
		headers: { Authorization: `Bearer ${started.secret}` },
	});
	return (await response.json()) as {
		answers: { questions: Answers; items: Record<string, Answers> };
		completed: boolean;
	};
}

const complete = (started: Started) => post(`/api/responses/${started.id}/complete`, {}, started);

describe("completing a response whose answers were changed on the way", () => {
	it("removes the answers to questions the person was, in the end, not asked", async () => {
		const started = await start();
		// Rye: stopped, with its follow-ups answered. Then the status is changed back.
		await save(started, "made", { option: "stopped" }, "rye-bread");
		await save(started, "stopped-why", { options: ["time", "other"] }, "rye-bread");
		await save(started, "stopped-why-other", "No oven for a year", "rye-bread");
		await save(started, "again", { option: "recipe" }, "rye-bread");
		await save(started, "recipe-fix", "The crumb", "rye-bread");
		await save(started, "made", { option: "never" }, "rye-bread");
		// Pita: stopped and still stopped, but the reason that opened a question was unticked.
		await save(started, "made", { option: "stopped" }, "pita");
		await save(started, "stopped-why", { options: ["other"] }, "pita");
		await save(started, "stopped-why-other", "Too flat", "pita");
		await save(started, "stopped-why", { options: ["time"] }, "pita");
		// And outside the breads: a starter's age, then no starter after all.
		await save(started, "starter", { option: "yes" });
		await save(started, "starter-age", 2);
		await save(started, "starter", { option: "no" });

		// While the response is open, all of it is still there: changing back brings it back.
		const open = await read(started);
		expect(Object.keys(open.answers.items["rye-bread"] ?? {}).sort()).toEqual([
			"again",
			"made",
			"recipe-fix",
			"stopped-why",
			"stopped-why-other",
		]);
		expect(open.answers.questions["starter-age"]?.value).toBe(2);

		expect((await complete(started)).status).toBe(200);
		const done = await read(started);
		expect(done.completed).toBe(true);
		expect(done.answers.items["rye-bread"]).toEqual({
			made: { value: { option: "never" }, activeMs: 1_000, changes: 1 },
		});
		expect(Object.keys(done.answers.items.pita ?? {}).sort()).toEqual(["made", "stopped-why"]);
		expect(Object.keys(done.answers.questions).sort()).toEqual(["starter"]);
		// Gone from the table, not hidden by the reader.
		const { results } = await forms.db
			.prepare("SELECT question_id, item_id FROM answer WHERE response_id = ?")
			.bind(started.id)
			.all();
		expect(results).toHaveLength(4);
		expect(JSON.stringify(results)).not.toContain("recipe-fix");
	});

	it("keeps every answer the final flow contains, a passed one included", async () => {
		const started = await start();
		await save(started, "made", { option: "stopped" }, "bagels");
		await save(started, "stopped-why", null, "bagels");
		await save(started, "again", { option: "no" }, "bagels");
		await save(started, "often", null);
		expect((await complete(started)).status).toBe(200);
		const done = await read(started);
		expect(done.answers.items.bagels).toMatchObject({
			made: { value: { option: "stopped" } },
			"stopped-why": { value: null },
			again: { value: { option: "no" } },
		});
		expect(done.answers.questions.often).toMatchObject({ value: null, activeMs: 500 });
	});

	it("happens once: a second request to complete does not move the time", async () => {
		const started = await start();
		const [first, second] = await Promise.all([complete(started), complete(started)]);
		expect([first.status, second.status]).toEqual([200, 200]);
		const at = async () =>
			(
				await forms.db
					.prepare("SELECT completed_at FROM response WHERE id = ?")
					.bind(started.id)
					.first<{ completed_at: number }>()
			)?.completed_at;
		const completedAt = await at();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect((await complete(started)).status).toBe(200);
		expect(await at()).toBe(completedAt);
	});

	it("closes the response to an answer that was already on its way", async () => {
		const started = await start();
		// Sent together: whichever the database runs first, the response ends up complete and
		// holds either the answer from before completion or none, never one written after it.
		const [saved, done] = await Promise.all([
			post(
				`/api/responses/${started.id}/progress`,
				{ answer: { question: "often", value: { option: "weekly" }, activeMs: 1 } },
				started,
			),
			complete(started),
		]);
		expect(done.status).toBe(200);
		const stored = (await read(started)).answers.questions.often;
		if (saved.status === 200) expect(stored?.value).toEqual({ option: "weekly" });
		else {
			expect(saved.status).toBe(409);
			expect(stored).toBeUndefined();
		}
		const late = await post(
			`/api/responses/${started.id}/progress`,
			{ position: "q:years" },
			started,
		);
		expect(late.status).toBe(409);
	});
});
