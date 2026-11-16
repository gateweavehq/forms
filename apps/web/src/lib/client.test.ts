import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Progress, sendProgress } from "./client";
import { SaveQueue } from "./save-queue";

// A page and the Worker that answers it are not always of one version: while a deployment
// rolls out, and after one is rolled back with a page still open. The Worker reads a save's
// body strictly, and the queue drops what is refused with a 400. So whatever a newer page adds
// to a save must not be in the body, or an older Worker refuses every answer it sends.

/**
 * What `POST /api/responses/<id>/progress` took before saves had marks, as `server/api.ts` had
 * it then (commit 3d1a65e). Pinned here on purpose, and not imported: it is the rule a Worker
 * from before this change applies, whatever the rule is today. It does not change.
 */
const progressBodyBeforeMarks = z.strictObject({
	answer: z
		.strictObject({
			question: z.string().min(1).max(64),
			item: z.string().min(1).max(64).optional(),
			value: z.unknown(),
			activeMs: z.number(),
		})
		.optional(),
	position: z.string().min(1).max(160).optional(),
});

interface Sent {
	path: string;
	headers: Headers;
	body: unknown;
}

/** A server that takes everything, or fails `failures` times first, and keeps what it was sent. */
function serverThatFails(failures = 0) {
	const sent: Sent[] = [];
	let left = failures;
	vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
		sent.push({
			path,
			headers: new Headers(init.headers),
			body: JSON.parse(String(init.body)),
		});
		if (left-- > 0) return Response.json({ error: "Something went wrong" }, { status: 500 });
		return Response.json({ saved: true });
	});
	return sent;
}

/** The page's queue, sending as the page sends. */
function queueOf() {
	return new SaveQueue(
		(progress: Progress) => sendProgress("a-response", "a-secret", progress),
		() => {},
		() => {
			throw new Error("The server refused a save");
		},
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("a save as the page sends it", () => {
	it("has a body a Worker from before the marks takes, with the mark in a header", async () => {
		const sent = serverThatFails();
		const queue = queueOf();
		queue.push({
			answer: { question: "made", item: "rye-bread", value: { option: "never" }, activeMs: 900 },
			position: "i:pita:made",
		});
		queue.push({ answer: { question: "often", value: null, activeMs: 0 } });
		queue.push({ position: "q:years" });
		await queue.settled();

		expect(sent).toHaveLength(3);
		for (const { body, path } of sent) {
			expect(path).toBe("/api/responses/a-response/progress");
			// The property itself: the strict rule of the older Worker takes the body as it is.
			expect(progressBodyBeforeMarks.safeParse(body).success).toBe(true);
			expect(body).not.toHaveProperty("save");
		}
		expect(sent[0]?.body).toEqual({
			answer: { question: "made", item: "rye-bread", value: { option: "never" }, activeMs: 900 },
			position: "i:pita:made",
		});
		// The mark is where an older Worker does not look.
		expect(sent[0]?.headers.get("X-Save")).toMatch(/^[0-9a-f]{32}$/);
		expect(sent[1]?.headers.get("X-Save")).toMatch(/^[0-9a-f]{32}$/);
		expect(sent[1]?.headers.get("X-Save")).not.toBe(sent[0]?.headers.get("X-Save"));
		// A note of the place alone has none.
		expect(sent[2]?.headers.has("X-Save")).toBe(false);
		expect(sent[0]?.headers.get("Authorization")).toBe("Bearer a-secret");
	});

	it("is the same request when it is sent again: the same body and the same mark", async () => {
		const sent = serverThatFails(1);
		const queue = queueOf();
		queue.push({ answer: { question: "often", value: { option: "weekly" }, activeMs: 900 } });
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		queue.retry();
		await queue.settled();
		queue.stop();

		expect(sent).toHaveLength(2);
		expect(sent[1]?.body).toEqual(sent[0]?.body);
		expect(sent[1]?.headers.get("X-Save")).toBe(sent[0]?.headers.get("X-Save"));
		expect(progressBodyBeforeMarks.safeParse(sent[1]?.body).success).toBe(true);
	});
});
