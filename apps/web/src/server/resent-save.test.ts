import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Progress, RequestFailed } from "../lib/client";
import { SaveQueue } from "../lib/save-queue";
import { createDb } from "./db";
import { faulty, migratedD1 } from "./db/faulty-d1";
import { unownedForm, withOwnedForm } from "./db/made-up";
import { createResponse, findResponse, readAnswers, saveProgress } from "./responses";

// A save the database committed, whose reply never reached the page. The page cannot tell that
// from a save that failed, so its queue sends it again. The row came out right before: one
// row, no change counted. The time the question was on screen was added a second time.
//
// The page's own queue does the sending here, against the statements the server runs and a
// real local D1 that commits a batch and then fails (`faulty-d1.ts`): what the queue sends
// again is what the server has to recognise, so neither is stood in for.

// `./forms` reads its settings from the Worker's runtime, which is not here.
vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let real: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
	({ d1: real, dispose } = await migratedD1("resent-save-test"));
});

afterAll(async () => {
	await dispose?.();
});

// A reply that is lost is a failed query to the server, which logs it. Not what is tested here.
beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

const WHY = "Because the kettle is next to my desk";

interface AnswerRow {
	question_id: string;
	value: string | null;
	active_ms: number;
	changes: number;
}

async function stored(d1: D1Database, responseId: string): Promise<AnswerRow[]> {
	const { results } = await d1
		.prepare(
			"select question_id, value, active_ms, changes from answer where response_id = ? order by question_id",
		)
		.bind(responseId)
		.all<AnswerRow>();
	return results;
}

/** A response to the made-up tea form, on a database that fails when told to. */
async function begun(d1: D1Database, id: string, owned = false) {
	const { database, state } = faulty(d1);
	const db = createDb(database);
	const form = owned ? (await withOwnedForm(d1, id)).form : await unownedForm(id);
	const started = await createResponse(db, form, "phone");
	const row = await findResponse(db, started.id, started.secret);
	if (!row) throw new Error("The response was not made");
	return { db, form, state, row, id: started.id };
}

/**
 * A page: its queue, sending to the server's own save. A failure of the server's reaches the
 * queue as the 500 the API answers it with. `failed` resolves the next time a sending fails,
 * and `sent` lists what was sent, each sending.
 */
function page({ db, form, row }: Awaited<ReturnType<typeof begun>>) {
	const sent: Progress[] = [];
	let heard: (() => void) | undefined;
	const queue = new SaveQueue(
		async (progress) => {
			sent.push(progress);
			try {
				await saveProgress(db, form.definition, row, progress);
			} catch {
				throw new RequestFailed(500);
			}
		},
		(failing) => {
			if (failing) heard?.();
		},
		() => {
			throw new Error("The server refused a save");
		},
	);
	const failed = () =>
		new Promise<void>((resolve) => {
			heard = resolve;
		});
	/** Sends one save and waits until it has arrived, losing the reply `losses` times first. */
	async function save(progress: Progress, losses = 0, state?: { batchLosses: number }) {
		for (let lost = 0; lost < losses; lost++) {
			if (!state) throw new Error("Losing a reply takes the database's state");
			state.batchLosses = 1;
			const failure = failed();
			if (lost === 0) queue.push(progress);
			else queue.retry();
			await failure;
		}
		if (losses === 0) queue.push(progress);
		else queue.retry();
		await queue.settled();
		queue.stop();
	}
	return { queue, sent, save };
}

describe("a save whose reply was lost", () => {
	it.each([
		["an example", false],
		["a form someone owns", true],
	])(
		"is stored once, with its time once, when the page sends it again, for %s",
		async (_w, owned) => {
			const response = await begun(real, `tea-lost-${owned}`, owned);
			const { sent, save } = page(response);
			const before = response.state.batches.length;

			await save(
				{ answer: { question: "why", value: WHY, activeMs: 900 }, position: "q:why" },
				1,
				response.state,
			);

			// It went twice, the same both times, and the database took both batches.
			expect(sent).toHaveLength(2);
			expect(sent[1]).toEqual(sent[0]);
			expect(response.state.batches).toHaveLength(before + 2);
			expect(await stored(real, response.id)).toEqual([
				{ question_id: "why", value: JSON.stringify(WHY), active_ms: 900, changes: 0 },
			]);
		},
	);

	it("is stored once however often the reply is lost", async () => {
		const response = await begun(real, "tea-lost-thrice");
		const { sent, save } = page(response);
		await save({ answer: { question: "why", value: WHY, activeMs: 900 } }, 3, response.state);
		expect(sent).toHaveLength(4);
		expect(await stored(real, response.id)).toMatchObject([{ active_ms: 900, changes: 0 }]);
	});

	it("counts a changed answer's change once and its time once", async () => {
		const response = await begun(real, "tea-lost-change");
		const { save } = page(response);
		await save({ answer: { question: "drink", value: { option: "yes" }, activeMs: 900 } });
		await save(
			{ answer: { question: "drink", value: { option: "no" }, activeMs: 500 } },
			1,
			response.state,
		);
		expect(await stored(real, response.id)).toEqual([
			{ question_id: "drink", value: '{"option":"no"}', active_ms: 1_400, changes: 1 },
		]);
	});

	it("leaves the next save of the same answer to be applied as any other", async () => {
		const response = await begun(real, "tea-lost-then-more");
		const { save, sent } = page(response);
		await save(
			{ answer: { question: "drink", value: { option: "yes" }, activeMs: 900 } },
			1,
			response.state,
		);
		// The person comes back to the card and leaves it with the same answer: another save,
		// with a mark of its own, whose time counts.
		await save({ answer: { question: "drink", value: { option: "yes" }, activeMs: 300 } });
		expect(await stored(real, response.id)).toMatchObject([{ active_ms: 1_200, changes: 0 }]);
		// And then changes it.
		await save({ answer: { question: "drink", value: { option: "no" }, activeMs: 200 } });
		expect(await stored(real, response.id)).toEqual([
			{ question_id: "drink", value: '{"option":"no"}', active_ms: 1_400, changes: 1 },
		]);
		const marks = sent.map((progress) => progress.save);
		expect(marks[1]).toBe(marks[0]);
		expect(new Set(marks).size).toBe(3);
	});

	it("still stores nothing, and then everything once, when the save failed before it was committed", async () => {
		const response = await begun(real, "tea-failed-first");
		const { queue, sent } = page(response);
		response.state.batchFailures = 1;
		queue.push({ answer: { question: "why", value: WHY, activeMs: 900 } });
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		await vi.waitFor(async () => expect(await stored(real, response.id)).toEqual([]));
		queue.retry();
		await queue.settled();
		queue.stop();
		expect(await stored(real, response.id)).toMatchObject([{ active_ms: 900, changes: 0 }]);
	});
});

describe("a save without a mark, from a page older than the marks", () => {
	it("is added each time it arrives, as it always was", async () => {
		const { db, form, row, id } = await begun(real, "tea-no-mark");
		const save = { answer: { question: "why", value: WHY, activeMs: 900 }, position: "q:why" };
		await saveProgress(db, form.definition, row, save);
		await saveProgress(db, form.definition, row, save);
		expect(await stored(real, id)).toEqual([
			{ question_id: "why", value: JSON.stringify(WHY), active_ms: 1_800, changes: 0 },
		]);
		const changed = { answer: { question: "why", value: "No reason", activeMs: 500 } };
		await saveProgress(db, form.definition, row, changed);
		await saveProgress(db, form.definition, row, changed);
		expect(await stored(real, id)).toMatchObject([{ active_ms: 2_800, changes: 1 }]);
	});

	it("is added after a marked save too, and a marked one after it", async () => {
		const { db, form, row, id } = await begun(real, "tea-mixed-marks");
		const answer = { question: "why", value: WHY, activeMs: 100 };
		const mark = "0123456789abcdef0123456789abcdef";
		await saveProgress(db, form.definition, row, { answer, save: mark });
		// The older page, open in another tab.
		await saveProgress(db, form.definition, row, { answer });
		await saveProgress(db, form.definition, row, { answer });
		expect(await stored(real, id)).toMatchObject([{ active_ms: 300 }]);
		await saveProgress(db, form.definition, row, { answer, save: "f".repeat(32) });
		expect(await stored(real, id)).toMatchObject([{ active_ms: 400, changes: 0 }]);
	});
});

describe("a mark that arrives with another answer", () => {
	// No page of ours sends one: the queue marks a save once and never changes what it holds.
	// But the request is answered "saved", so the answer has to be: it is a save like any other.
	it("is stored: only a save whose mark and answer the row both has was applied before", async () => {
		const { db, form, row, id } = await begun(real, "tea-mark-reused");
		const save = "0123456789abcdef0123456789abcdef";
		await saveProgress(db, form.definition, row, {
			answer: { question: "drink", value: { option: "yes" }, activeMs: 900 },
			save,
		});
		await saveProgress(db, form.definition, row, {
			answer: { question: "drink", value: { option: "no" }, activeMs: 500 },
			save,
		});
		expect(await stored(real, id)).toEqual([
			{ question_id: "drink", value: '{"option":"no"}', active_ms: 1_400, changes: 1 },
		]);
		// A row keeps its own last mark: the same mark on another question is a save of that one.
		await saveProgress(db, form.definition, row, {
			answer: { question: "why", value: WHY, activeMs: 300 },
			save,
		});
		expect(await stored(real, id)).toEqual([
			{ question_id: "drink", value: '{"option":"no"}', active_ms: 1_400, changes: 1 },
			{ question_id: "why", value: JSON.stringify(WHY), active_ms: 300, changes: 0 },
		]);
	});
});

describe("a response open on two devices", () => {
	it("counts each device's save, and a resend of either once", async () => {
		const response = await begun(real, "tea-two-devices");
		const phone = page(response);
		const desk = page(response);
		const answer = (activeMs: number) => ({
			answer: { question: "why", value: WHY, activeMs },
		});
		// The same answer, given on each: two saves, each with a mark of its own.
		await phone.save(answer(900));
		await desk.save(answer(700), 1, response.state);
		expect(phone.sent[0]?.save).not.toBe(desk.sent[0]?.save);
		expect(await stored(real, response.id)).toMatchObject([{ active_ms: 1_600, changes: 0 }]);
		// Each goes on, and loses a reply in turn.
		await phone.save(answer(50), 1, response.state);
		await desk.save(
			{ answer: { question: "why", value: "No reason", activeMs: 25 } },
			1,
			response.state,
		);
		expect(await stored(real, response.id)).toEqual([
			{ question_id: "why", value: '"No reason"', active_ms: 1_675, changes: 1 },
		]);
	});

	it("cannot recognise a resend that another device's save of the same answer came before", async () => {
		// What the row keeps is its last save's mark, not every mark it ever had. So this order,
		// which takes two devices on one card and a lost reply between them, still counts the
		// phone's time twice and puts its answer back. It is said in docs/architecture.md; this
		// test is here so that the limit is known, and changes only on purpose.
		const response = await begun(real, "tea-two-devices-between");
		const { db, form, row, id } = response;
		const phone = { answer: { question: "why", value: WHY, activeMs: 900 }, save: "a".repeat(32) };
		const desk = {
			answer: { question: "why", value: "No reason", activeMs: 700 },
			save: "d".repeat(32),
		};
		await saveProgress(db, form.definition, row, phone);
		await saveProgress(db, form.definition, row, desk);
		await saveProgress(db, form.definition, row, phone);
		expect(await stored(real, id)).toEqual([
			{ question_id: "why", value: JSON.stringify(WHY), active_ms: 2_500, changes: 2 },
		]);
	});
});

describe("a response begun before the column for the mark existed", () => {
	it("goes on mid-survey: its rows are added to, and a resend is recognised from the next save on", async () => {
		const old = await migratedD1("resent-save-before-test", { before: "0007_" });
		try {
			const response = await begun(old.d1, "tea-before");
			const { db, form, row, id } = response;
			// An answer as the server wrote it before the migration: the statement it ran then.
			await old.d1
				.prepare(
					`INSERT INTO answer (response_id, question_id, item_id, value, active_ms, changes, updated_at)
					VALUES (?, 'drink', '', '{"option":"yes"}', 900, 0, 1), (?, 'why', '', ?, 400, 0, 1)`,
				)
				.bind(id, id, JSON.stringify(WHY))
				.run();
			await old.migrateRest();

			// What it had is read as it was.
			expect((await readAnswers(db, id)).questions).toEqual({
				drink: { value: { option: "yes" }, activeMs: 900, changes: 0 },
				why: { value: WHY, activeMs: 400, changes: 0 },
			});
			// The new page saves the same answer again, and loses the reply: the row had no mark,
			// so the save is applied, once.
			const { save } = page(response);
			await save(
				{ answer: { question: "why", value: WHY, activeMs: 100 }, position: "q:why" },
				1,
				response.state,
			);
			// And changes the other, the same way.
			await save(
				{ answer: { question: "drink", value: { option: "no" }, activeMs: 500 } },
				1,
				response.state,
			);
			// A page from before, still open in a tab, sends no mark and is taken as before.
			await saveProgress(db, form.definition, row, {
				answer: { question: "why", value: WHY, activeMs: 50 },
			});
			expect(await stored(old.d1, id)).toEqual([
				{ question_id: "drink", value: '{"option":"no"}', active_ms: 1_400, changes: 1 },
				{ question_id: "why", value: JSON.stringify(WHY), active_ms: 550, changes: 0 },
			]);
		} finally {
			await old.dispose();
		}
	});
});
