import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Forms, startForms } from "./forms-worker";

let forms: Forms;

beforeAll(async () => {
	forms = await startForms({ startsPerMinute: 3, detachedPerMinute: 2 });
});
afterAll(() => forms.dispose());

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
	return forms.fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

async function count(table: string): Promise<number> {
	const row = await forms.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
	return row?.n ?? 0;
}

describe("the ceilings on the addresses that need no secret", () => {
	it("stop a flood of new responses to one form, and store none of the refused", async () => {
		const start = () => post("/api/forms/home-baking/responses", { device: "desk", consent: true });
		const statuses: number[] = [];
		for (let tries = 0; tries < 6; tries++) statuses.push((await start()).status);
		expect(statuses).toEqual([201, 201, 201, 429, 429, 429]);
		expect(await count("response")).toBe(3);
		const refused = await start();
		expect(await refused.json()).toEqual({
			error: "Many people are starting this form right now. Try again in a minute.",
		});
	});

	it("count each form by itself", async () => {
		const other = await post("/api/forms/quick-feedback/responses", { device: "desk" });
		expect(other.status).toBe(201);
	});

	it("are the same for every sender: no address is read to tell them apart", async () => {
		// The first form is at its ceiling. A request that claims another address is refused
		// like any other, because the count is the form's.
		const elsewhere = await post(
			"/api/forms/home-baking/responses",
			{ device: "desk", consent: true },
			{ "CF-Connecting-IP": "203.0.113.9", "X-Forwarded-For": "203.0.113.9" },
		);
		expect(elsewhere.status).toBe(429);
	});

	it("stop a flood of detached answers, and store none of the refused", async () => {
		const send = (name: string) =>
			post("/api/forms/home-baking/detached", { answers: { email: `${name}@example.test` } });
		const statuses = [
			(await send("one")).status,
			(await send("two")).status,
			(await send("three")).status,
		];
		expect(statuses).toEqual([201, 201, 429]);
		expect(await count("detached_answer")).toBe(2);
	});

	it("do not count what was refused for another reason", async () => {
		// Not JSON, an unknown form, a body of the wrong shape: none of these is a start.
		const forms2 = await startForms({ startsPerMinute: 1 });
		try {
			const bad = await forms2.fetch("/api/forms/quick-feedback/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device: "watch" }),
			});
			expect(bad.status).toBe(400);
			const good = await forms2.fetch("/api/forms/quick-feedback/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device: "desk" }),
			});
			expect(good.status).toBe(201);
		} finally {
			await forms2.dispose();
		}
	});

	it("leave an open response alone: answering needs its secret, and has no ceiling here", async () => {
		const started = await post("/api/forms/quick-feedback/responses", { device: "desk" });
		expect(started.status).toBe(201);
		const { id, secret } = (await started.json()) as { id: string; secret: string };
		for (let saves = 0; saves < 8; saves++) {
			const saved = await post(
				`/api/responses/${id}/progress`,
				{ position: "q:found" },
				{ Authorization: `Bearer ${secret}` },
			);
			expect(saved.status).toBe(200);
		}
	});
});
