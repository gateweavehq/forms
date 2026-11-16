import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Progress, RequestFailed } from "./client";
import { SaveQueue } from "./save-queue";

/** A server the test controls: it records what arrives, and can be told to fail. */
function server() {
	const arrived: string[] = [];
	let down: RequestFailed | undefined;
	return {
		arrived,
		fail(error: RequestFailed | undefined) {
			down = error;
		},
		send: async (progress: Progress) => {
			await Promise.resolve();
			if (down) throw down;
			arrived.push(progress.position ?? "");
		},
	};
}

describe("the save queue", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends in the order things were given", async () => {
		const { arrived, send } = server();
		const queue = new SaveQueue(
			send,
			() => {},
			() => {},
		);
		queue.push({ position: "q:one" });
		queue.push({ position: "q:two" });
		queue.push({ position: "q:three" });
		await queue.settled();
		expect(arrived).toEqual(["q:one", "q:two", "q:three"]);
	});

	it("keeps what did not arrive and sends it again, still in order", async () => {
		const { arrived, send, fail } = server();
		const failing: boolean[] = [];
		const queue = new SaveQueue(
			send,
			(state) => failing.push(state),
			() => {},
		);
		fail(new RequestFailed(0));
		queue.push({ position: "q:one" });
		queue.push({ position: "q:two" });
		await vi.advanceTimersByTimeAsync(0);
		expect(arrived).toEqual([]);
		expect(failing).toEqual([true]);

		fail(undefined);
		await vi.advanceTimersByTimeAsync(1_000);
		await queue.settled();
		expect(arrived).toEqual(["q:one", "q:two"]);
		expect(failing).toEqual([true, false]);
	});

	it("waits longer after each failure, and can be told to try now", async () => {
		const { arrived, send, fail } = server();
		const queue = new SaveQueue(
			send,
			() => {},
			() => {},
		);
		fail(new RequestFailed(503));
		queue.push({ position: "q:one" });
		await vi.advanceTimersByTimeAsync(1_000);
		await vi.advanceTimersByTimeAsync(1_500);
		expect(arrived).toEqual([]);
		fail(undefined);
		// The second retry is two seconds after the first, so it is not due yet.
		expect(arrived).toEqual([]);
		queue.retry();
		await queue.settled();
		expect(arrived).toEqual(["q:one"]);
	});

	it("drops what the server refused, so that it does not hold back what comes after", async () => {
		const { arrived, send, fail } = server();
		const failing: boolean[] = [];
		const refused: Array<string | undefined> = [];
		const queue = new SaveQueue(
			send,
			(state) => failing.push(state),
			(progress) => refused.push(progress.position),
		);
		fail(new RequestFailed(400));
		queue.push({ position: "q:refused" });
		await queue.settled();
		// It is gone from the queue, and never silently: whoever owns the queue is told which.
		expect(refused).toEqual(["q:refused"]);
		fail(undefined);
		queue.push({ position: "q:next" });
		await queue.settled();
		expect(arrived).toEqual(["q:next"]);
		expect(failing).toEqual([]);
	});

	// What the server answers when its database fails (`DatabaseError`): a 500, which is not a
	// refusal. The answer was not stored, so it must stay first in line and be said to be failing.
	it("keeps an answer the server failed to store, never as refused, and sends it when it can", async () => {
		const { arrived, send, fail } = server();
		const failing: boolean[] = [];
		const refused: Array<string | undefined> = [];
		const queue = new SaveQueue(
			send,
			(state) => failing.push(state),
			(progress) => refused.push(progress.position),
		);
		fail(new RequestFailed(500));
		queue.push({ position: "q:one" });
		queue.push({ position: "q:two" });
		await vi.advanceTimersByTimeAsync(1_000);
		expect(arrived).toEqual([]);
		expect(refused).toEqual([]);
		expect(failing).toEqual([true, true]);

		fail(undefined);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(arrived).toEqual(["q:one", "q:two"]);
		expect(refused).toEqual([]);
		expect(failing).toEqual([true, true, false]);
	});

	it("is settled at once when nothing is waiting", async () => {
		const queue = new SaveQueue(
			server().send,
			() => {},
			() => {},
		);
		await expect(queue.settled()).resolves.toBeUndefined();
	});
});
