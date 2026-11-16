import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Forms, startForms } from "./forms-worker";

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

interface Stored {
	answers: {
		questions: Record<string, { value: unknown; activeMs: number; changes: number }>;
		items: Record<string, Record<string, { value: unknown; activeMs: number; changes: number }>>;
	};
	position: string | null;
	completed: boolean;
	formChanged: boolean;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
	return forms.fetch(path, {
		method: "POST",
		headers: { ...json, ...headers },
		body: JSON.stringify(body),
	});
}

async function start(form = "home-baking", device = "phone"): Promise<Started> {
	const consent = form === "home-baking" ? { consent: true } : {};
	const response = await post(`/api/forms/${form}/responses`, { device, ...consent });
	expect(response.status).toBe(201);
	return (await response.json()) as Started;
}

const bearer = ({ secret }: Started) => ({ Authorization: `Bearer ${secret}` });

function progress(started: Started, body: unknown): Promise<Response> {
	return post(`/api/responses/${started.id}/progress`, body, bearer(started));
}

async function read(started: Started): Promise<Stored> {
	const response = await forms.fetch(`/api/responses/${started.id}`, { headers: bearer(started) });
	expect(response.status).toBe(200);
	return (await response.json()) as Stored;
}

async function rows(table: string): Promise<Array<Record<string, unknown>>> {
	const { results } = await forms.db.prepare(`SELECT * FROM ${table}`).all();
	return results as Array<Record<string, unknown>>;
}

const answer = (question: string, value: unknown, item?: string, activeMs = 1_000) => ({
	answer: { question, value, activeMs, ...(item ? { item } : {}) },
});

describe("starting a response", () => {
	it("gives an id and a secret, once", async () => {
		const started = await start();
		expect(started.id).toMatch(/^[\w-]{16}$/);
		expect(started.secret).toMatch(/^[\w-]{43}$/);
		expect((await start()).id).not.toBe(started.id);
	});

	it("stores the screen's rough size, a seal of the secret, and nothing about who it was", async () => {
		const response = await post(
			"/api/forms/home-baking/responses",
			{ device: "tablet", consent: true },
			{
				"CF-Connecting-IP": "203.0.113.77",
				"X-Forwarded-For": "203.0.113.77",
				"X-Real-IP": "203.0.113.77",
				"User-Agent": "TestBrowser/9.9 (Imaginary Phone)",
			},
		);
		const started = (await response.json()) as Started;
		const [row] = (await rows("response")).filter(({ id }) => id === started.id);
		expect(row).toMatchObject({ form_id: "home-baking", device: "tablet", completed_at: null });
		expect(Object.keys(row ?? {}).sort()).toEqual([
			"answers_version",
			"completed_at",
			"created_at",
			"definition_hash",
			"device",
			"form_id",
			"id",
			"position",
			"secret_seal",
			"updated_at",
		]);
		const everything = JSON.stringify([
			await rows("response"),
			await rows("answer"),
			await rows("detached_answer"),
		]);
		expect(everything).not.toContain("203.0.113.77");
		expect(everything).not.toContain("TestBrowser");
		// The secret opens the response, so it is not what the database keeps.
		expect(everything).not.toContain(started.secret);
		expect(row?.secret_seal).toMatch(/^[\w-]{43}$/);
	});

	it("waits for the consent of a form that has one", async () => {
		const without = await post("/api/forms/home-baking/responses", { device: "desk" });
		expect(without.status).toBe(400);
		const refused = await post("/api/forms/home-baking/responses", {
			device: "desk",
			consent: false,
		});
		expect(refused.status).toBe(400);
		// A form without a consent step starts without one.
		expect((await post("/api/forms/quick-feedback/responses", { device: "desk" })).status).toBe(
			201,
		);
	});

	it("refuses a form that does not exist, a device it does not know, and anything but JSON", async () => {
		expect((await post("/api/forms/nope/responses", { device: "desk" })).status).toBe(404);
		const strange = await post("/api/forms/quick-feedback/responses", { device: "watch" });
		expect(strange.status).toBe(400);
		const extra = await post("/api/forms/quick-feedback/responses", { device: "desk", name: "A" });
		expect(extra.status).toBe(400);
		// What a form on another site could post without the browser asking first.
		const plain = await forms.fetch("/api/forms/quick-feedback/responses", {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: JSON.stringify({ device: "desk" }),
		});
		expect(plain.status).toBe(415);
	});
});

describe("opening a response", () => {
	it("answers the same to a wrong secret, no secret and an id that does not exist", async () => {
		const started = await start();
		const tries = await Promise.all([
			forms.fetch(`/api/responses/${started.id}`, { headers: { Authorization: "Bearer wrong" } }),
			forms.fetch(`/api/responses/${started.id}`),
			forms.fetch("/api/responses/AAAAAAAAAAAAAAAA", { headers: bearer(started) }),
		]);
		const bodies = await Promise.all(tries.map((response) => response.text()));
		expect(tries.map((response) => response.status)).toEqual([404, 404, 404]);
		expect(new Set(bodies).size).toBe(1);
	});

	it("does not open with another response's secret", async () => {
		const [one, two] = [await start(), await start()];
		const response = await forms.fetch(`/api/responses/${one.id}`, { headers: bearer(two) });
		expect(response.status).toBe(404);
	});

	it("is not kept by a cache", async () => {
		const started = await start();
		const response = await forms.fetch(`/api/responses/${started.id}`, {
			headers: bearer(started),
		});
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
});

describe("saving answers as they are given", () => {
	it("stores an answer and where the person is now", async () => {
		const started = await start();
		const saved = await progress(started, {
			...answer("often", { option: "weekly" }),
			position: "q:years",
		});
		expect(saved.status).toBe(200);
		expect(await read(started)).toMatchObject({
			answers: {
				version: 1,
				questions: { often: { value: { option: "weekly" }, activeMs: 1_000, changes: 0 } },
				items: {},
			},
			position: "q:years",
			completed: false,
			formChanged: false,
		});
	});

	it("keys a block's answer by its item", async () => {
		const started = await start();
		await progress(started, answer("made", { option: "stopped" }, "rye-bread"));
		await progress(started, answer("made", { option: "never" }, "pita"));
		expect((await read(started)).answers.items).toMatchObject({
			"rye-bread": { made: { value: { option: "stopped" } } },
			pita: { made: { value: { option: "never" } } },
		});
	});

	it("adds up the time over visits, and counts a change when the answer becomes another", async () => {
		const started = await start();
		const steps: Array<[unknown, number]> = [
			// Seen and passed: no answer yet.
			[null, 400],
			// The first answer is not a change.
			[{ option: "weekly" }, 600],
			// The same answer again, after going back and forth.
			[{ option: "weekly" }, 100],
			[{ option: "rarely" }, 900],
			// Taking an answer away changes it too.
			[null, 50],
		];
		const seen: Array<[unknown, number, number]> = [];
		for (const [value, activeMs] of steps) {
			await progress(started, answer("often", value, undefined, activeMs));
			const { often } = (await read(started)).answers.questions;
			seen.push([often?.value, often?.activeMs ?? 0, often?.changes ?? 0]);
		}
		expect(seen).toEqual([
			[null, 400, 0],
			[{ option: "weekly" }, 1_000, 0],
			[{ option: "weekly" }, 1_100, 0],
			[{ option: "rarely" }, 2_000, 1],
			[null, 2_050, 2],
		]);
	});

	// The page sends a save again when no reply came, and the save may have been stored. Two
	// requests with the same body are what that is to the server. (That the page's queue sends
	// the same mark again, and what the database then does when it had committed the first, is
	// tested with the queue itself in `src/server/resent-save.test.ts`.)
	/** A mark as the page makes one: 32 hex characters. */
	const mark = (letter: string) => letter.repeat(32);

	/** A save with its mark where the page puts it: in a header, beside a body like any other. */
	function marked(started: Started, body: unknown, save: string): Promise<Response> {
		return post(`/api/responses/${started.id}/progress`, body, {
			...bearer(started),
			"X-Save": save,
		});
	}

	it("stores a save that arrives twice with the same mark once: its time, its change and its answer", async () => {
		const started = await start();
		const twice = async (body: Record<string, unknown>, save: string) => {
			const statuses: number[] = [];
			const replies: unknown[] = [];
			for (let sending = 0; sending < 2; sending++) {
				const response = await marked(started, body, save);
				statuses.push(response.status);
				replies.push(await response.json());
			}
			// Answered the second time as the first, so that the page's queue lets go of it.
			expect(statuses).toEqual([200, 200]);
			expect(replies).toEqual([{ saved: true }, { saved: true }]);
		};
		await twice(answer("often", { option: "weekly" }, undefined, 900), mark("1"));
		expect((await read(started)).answers.questions.often).toEqual({
			value: { option: "weekly" },
			activeMs: 900,
			changes: 0,
		});
		await twice(
			{ ...answer("often", { option: "rarely" }, undefined, 500), position: "q:years" },
			mark("2"),
		);
		expect(await read(started)).toMatchObject({
			answers: {
				questions: { often: { value: { option: "rarely" }, activeMs: 1_400, changes: 1 } },
			},
			position: "q:years",
		});
		// The same answer once more, as another save: the person came back to the card.
		await marked(started, answer("often", { option: "rarely" }, undefined, 100), mark("3"));
		expect((await read(started)).answers.questions.often).toMatchObject({
			activeMs: 1_500,
			changes: 1,
		});
		expect(await rows("answer")).toContainEqual(
			expect.objectContaining({
				response_id: started.id,
				question_id: "often",
				save_id: mark("3"),
			}),
		);
	});

	it("takes back what a status closed when its save arrives twice, and nothing more", async () => {
		const started = await start();
		await marked(started, answer("made", { option: "stopped" }, "rye-bread"), mark("a"));
		await marked(
			started,
			answer("stopped-why", { options: ["time"] }, "rye-bread", 700),
			mark("b"),
		);
		await marked(started, answer("made", { option: "sometimes" }, "pita"), mark("c"));
		const never = answer("made", { option: "never" }, "rye-bread", 300);
		expect((await marked(started, never, mark("d"))).status).toBe(200);
		expect((await marked(started, never, mark("d"))).status).toBe(200);
		expect((await read(started)).answers.items).toEqual({
			"rye-bread": { made: { value: { option: "never" }, activeMs: 1_300, changes: 1 } },
			pita: { made: { value: { option: "sometimes" }, activeMs: 1_000, changes: 0 } },
		});
	});

	// No page of ours sends a mark again with another answer. A request that does is answered
	// "saved", so it has to be: stored, with what it closes taken back, like any other save.
	it("stores an answer that comes under a mark its row already has, when the answer is another", async () => {
		const started = await start();
		const same = mark("e");
		await marked(started, answer("made", { option: "stopped" }, "rye-bread", 900), same);
		await marked(started, answer("stopped-why", { options: ["time"] }, "rye-bread"), mark("f"));
		const again = await marked(
			started,
			answer("made", { option: "never" }, "rye-bread", 500),
			same,
		);
		expect(again.status).toBe(200);
		expect((await read(started)).answers.items).toEqual({
			"rye-bread": { made: { value: { option: "never" }, activeMs: 1_400, changes: 1 } },
		});
	});

	// A save that was applied before writes nothing. So it deletes nothing either: what it
	// closed went the first time, and what was stored since is not this request's to remove.
	it("deletes nothing for a save it has applied before", async () => {
		const started = await start();
		const never = answer("made", { option: "never" }, "rye-bread", 300);
		await marked(started, never, mark("a"));
		// A row under the question the status closed, put there as no request can put it (a
		// save of it is taken back at once): the test is of the resend, which must not touch it.
		await forms.db
			.prepare(
				`INSERT INTO answer (response_id, question_id, item_id, value, active_ms, changes, updated_at)
				VALUES (?, 'stopped-why', 'rye-bread', '{"options":["time"]}', 1000, 0, 1)`,
			)
			.bind(started.id)
			.run();
		expect((await marked(started, never, mark("a"))).status).toBe(200);
		expect((await read(started)).answers.items).toEqual({
			"rye-bread": {
				made: { value: { option: "never" }, activeMs: 300, changes: 0 },
				"stopped-why": { value: { options: ["time"] }, activeMs: 1_000, changes: 0 },
			},
		});
		// The same answer as a new save is one like any other, and takes back what it closes.
		await marked(started, never, mark("c"));
		expect((await read(started)).answers.items).toEqual({
			"rye-bread": { made: { value: { option: "never" }, activeMs: 600, changes: 0 } },
		});
	});

	// A tab left open, or a second device, can send an answer to a question the response no
	// longer asks. When that question rules another, its own answer is among what the save
	// takes back: the row is written and deleted in the same batch, and nothing of it stays.
	it.each([
		["without a mark", undefined],
		["with a mark", "b".repeat(32)],
	])(
		"does not keep an answer to a question that is closed, sent %s, however often",
		async (_how, save) => {
			const started = await start();
			await marked(started, answer("made", { option: "never" }, "rye-bread", 300), mark("a"));
			const late = {
				...answer("stopped-why", { options: ["time"] }, "rye-bread"),
				position: "q:years",
			};
			const send = () =>
				save === undefined ? progress(started, late) : marked(started, late, save);
			for (let sending = 0; sending < 2; sending++) {
				const response = await send();
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({ saved: true });
				expect(await read(started)).toMatchObject({
					answers: {
						items: {
							"rye-bread": { made: { value: { option: "never" }, activeMs: 300, changes: 0 } },
						},
					},
					// The place is stored all the same, and read from the batch's last statement.
					position: "q:years",
				});
				expect((await read(started)).answers.items["rye-bread"]).not.toHaveProperty("stopped-why");
			}
			expect((await rows("answer")).filter((each) => each.response_id === started.id)).toHaveLength(
				1,
			);
		},
	);

	it("adds a save without a mark each time it arrives, as a page from before the marks expects", async () => {
		const started = await start();
		const body = answer("often", { option: "weekly" }, undefined, 900);
		await progress(started, body);
		await progress(started, body);
		expect((await read(started)).answers.questions.often).toEqual({
			value: { option: "weekly" },
			activeMs: 1_800,
			changes: 0,
		});
		const [row] = (await rows("answer")).filter((each) => each.response_id === started.id);
		expect(row?.save_id).toBeNull();
	});

	// The failure has one direction: a time counted twice, never an answer lost. So a mark that
	// is not one is no reason to refuse: the save is stored as one without a mark is.
	it("stores a save whose mark is not one, as a save without a mark", async () => {
		const started = await start();
		const garbage = [
			"short",
			"x".repeat(33),
			"0123456789ABCDEF0123456789ABCDEF",
			"0123456789abcdef0123456789abcdeg",
			"with a space in the middle, and more",
			"'; DROP TABLE answer; --",
			"",
		];
		for (const save of garbage) {
			const response = await marked(
				started,
				answer("often", { option: "weekly" }, undefined, 100),
				save,
			);
			expect(response.status, save).toBe(200);
			expect(await response.json()).toEqual({ saved: true });
		}
		// Each was a save of its own, and so is one of them sent twice running: what is not a
		// mark is not kept as one, however much it looks like one (capitals, here).
		const almost = "0123456789ABCDEF0123456789ABCDEF";
		await marked(started, answer("often", { option: "weekly" }, undefined, 100), almost);
		await marked(started, answer("often", { option: "weekly" }, undefined, 100), almost);
		expect((await read(started)).answers.questions.often).toEqual({
			value: { option: "weekly" },
			activeMs: 100 * (garbage.length + 2),
			changes: 0,
		});
		const [row] = (await rows("answer")).filter((each) => each.response_id === started.id);
		expect(row?.save_id).toBeNull();
	});

	it("brings a time that cannot be into range, and keeps the answer", async () => {
		const started = await start();
		// A tab left open for a week, a clock that ran backwards, and a fraction.
		const long = await progress(started, answer("often", { option: "weekly" }, undefined, 6e8));
		const negative = await progress(started, answer("years", 3, undefined, -5));
		const fraction = await progress(started, answer("oven", { option: "gas" }, undefined, 10.6));
		expect([long.status, negative.status, fraction.status]).toEqual([200, 200, 200]);
		expect((await read(started)).answers.questions).toMatchObject({
			often: { value: { option: "weekly" }, activeMs: 86_400_000 },
			years: { value: 3, activeMs: 0 },
			oven: { value: { option: "gas" }, activeMs: 11 },
		});
	});

	it("does not count the same options ticked in another order as a change", async () => {
		const started = await start();
		await progress(started, answer("reasons", { options: ["taste", "cost"] }));
		await progress(started, answer("reasons", { options: ["cost", "taste"] }));
		expect((await read(started)).answers.questions.reasons).toMatchObject({
			value: { options: ["taste", "cost"] },
			changes: 0,
		});
	});

	it("refuses what the form's definition does not allow", async () => {
		const started = await start();
		const refused: Array<[string, unknown]> = [
			["a question the form does not have", answer("shoe-size", 42)],
			["an option the question does not have", answer("often", { option: "hourly" })],
			["a number outside its limits", answer("years", 500)],
			["text where a number belongs", answer("years", "three")],
			[
				"more options than the question allows",
				answer("reasons", { options: ["taste", "cost", "craft"] }),
			],
			[
				"a line of text for an option that does not ask for one",
				answer("often", { option: "weekly", text: "x" }),
			],
			["a block's question without its item", answer("made", { option: "never" })],
			[
				"a block's question for an item that is not one",
				answer("made", { option: "never" }, "croissant"),
			],
			["an item for a question that is asked once", answer("often", { option: "weekly" }, "pita")],
			["a place that is not one", { position: "<script>" }],
			["a key it does not know", { position: "q:years", note: "hello" }],
		];
		for (const [what, body] of refused) {
			const response = await progress(started, body);
			expect(response.status, what).toBe(400);
		}
		expect((await read(started)).answers).toEqual({ version: 1, questions: {}, items: {} });
	});

	it("refuses a body larger than an answer can be", async () => {
		const started = await start();
		const response = await progress(started, answer("comments", "x".repeat(70_000)));
		expect(response.status).toBe(413);
	});

	it("needs the response's secret", async () => {
		const started = await start();
		const body = answer("often", { option: "weekly" });
		const without = await post(`/api/responses/${started.id}/progress`, body);
		const wrong = await post(`/api/responses/${started.id}/progress`, body, {
			Authorization: "Bearer wrong",
		});
		expect([without.status, wrong.status]).toEqual([404, 404]);
		expect((await read(started)).answers.questions).toEqual({});
	});
});

describe("completing a response", () => {
	it("closes it: nothing can be changed afterwards", async () => {
		const started = await start();
		await progress(started, answer("often", { option: "weekly" }));
		const completed = await post(`/api/responses/${started.id}/complete`, {}, bearer(started));
		expect(completed.status).toBe(200);
		expect((await read(started)).completed).toBe(true);

		const late = await progress(started, answer("often", { option: "rarely" }));
		expect(late.status).toBe(409);
		expect((await read(started)).answers.questions.often?.value).toEqual({ option: "weekly" });
		// Completing again is harmless: a second press on Finish must not fail.
		const again = await post(`/api/responses/${started.id}/complete`, {}, bearer(started));
		expect(again.status).toBe(200);
	});

	it("is refused while a required question that is shown has no answer, and says which", async () => {
		const started = await start("quick-feedback");
		const early = await post(`/api/responses/${started.id}/complete`, {}, bearer(started));
		expect(early.status).toBe(422);
		expect(await early.json()).toMatchObject({ missing: ["q:found"] });
		expect((await read(started)).completed).toBe(false);

		await progress(started, answer("found", { option: "yes" }));
		const done = await post(`/api/responses/${started.id}/complete`, {}, bearer(started));
		expect(done.status).toBe(200);
	});
});

describe("answers a form keeps apart", () => {
	it("are stored with the form's id and nothing else", async () => {
		const before = (await rows("detached_answer")).length;
		const stored = await post("/api/forms/home-baking/detached", {
			answers: { email: "reader@example.test", contact: { option: "yes" } },
		});
		expect(stored.status).toBe(201);
		const all = await rows("detached_answer");
		expect(all).toHaveLength(before + 1);
		const row = all.find(({ answers }) => String(answers).includes("reader@example.test"));
		// No response id, no time, no device: only what was entered, and which form it was for.
		expect(Object.keys(row ?? {}).sort()).toEqual(["answers", "form_id", "id"]);
		expect(row?.form_id).toBe("home-baking");
		expect(JSON.parse(String(row?.answers))).toEqual({
			contact: { option: "yes" },
			email: "reader@example.test",
		});
	});

	it("are not numbered in the order they arrive", async () => {
		for (const name of ["one", "two", "three", "four"]) {
			await post("/api/forms/home-baking/detached", { answers: { email: `${name}@example.test` } });
		}
		const ids = (await rows("detached_answer"))
			.filter(({ answers }) => /one|two|three|four/.test(String(answers)))
			.map(({ id }) => Number(id));
		expect(ids).toHaveLength(4);
		// Rows numbered as they arrive would be 1, 2, 3, 4: each response's contact details
		// could then be paired with the response completed just before.
		expect(Math.max(...ids)).toBeGreaterThan(1_000_000);
		const inOrder = [...ids].sort((a, b) => a - b);
		const consecutive = inOrder.every(
			(id, index) => index === 0 || id === (inOrder[index - 1] ?? 0) + 1,
		);
		expect(consecutive).toBe(false);
	});

	it("cannot be stored with a response, where they would be linked to it", async () => {
		const started = await start();
		const response = await progress(started, answer("email", "reader@example.test"));
		expect(response.status).toBe(400);
		expect(JSON.stringify(await rows("answer"))).not.toContain("reader@example.test");
	});

	it("keep only what the form would have asked", async () => {
		// The second question is asked of someone who left an address. Without one, it was not.
		const alone = await post("/api/forms/home-baking/detached", {
			answers: { contact: { option: "yes" } },
		});
		expect(alone.status).toBe(400);
		const unknown = await post("/api/forms/home-baking/detached", { answers: { often: "x" } });
		expect(unknown.status).toBe(400);
		const invalid = await post("/api/forms/home-baking/detached", { answers: { email: "nope" } });
		expect(invalid.status).toBe(400);
		const none = await post("/api/forms/quick-feedback/detached", { answers: {} });
		expect(none.status).toBe(400);
	});
});

describe("what leaves the Worker", () => {
	it("is no request to anywhere, and no log of a secret", async () => {
		const started = await start();
		await progress(started, answer("often", { option: "weekly" }));
		await read(started);
		// A fault of the server's own is logged by its name alone.
		await post(`/api/responses/${started.id}/progress`, "not an object", bearer(started));
		expect(forms.outbound).toEqual([]);
		const logged = forms.logs.map((log) => log.message).join("\n");
		expect(logged).not.toContain(started.secret);
		expect(logged).not.toContain("weekly");
	});
});

describe("reading answers the way results will", () => {
	it("finds every response's answer to one question for one item through an index", async () => {
		const { results } = await forms.db
			.prepare("EXPLAIN QUERY PLAN SELECT value FROM answer WHERE question_id = ? AND item_id = ?")
			.bind("made", "rye-bread")
			.all();
		const plan = JSON.stringify(results);
		// Not a walk through every answer of every response.
		expect(plan).toContain("answer_question_idx");
		expect(plan).not.toContain("SCAN");
	});
});
