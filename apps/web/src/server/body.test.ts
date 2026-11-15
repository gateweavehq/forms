import { describe, expect, it } from "vitest";
import { readCapped, TooLarge } from "./body";

/** A body that arrives in chunks without saying how long it is, and counts what was taken. */
function chunked(chunks: number, bytesEach: number) {
	const taken = { chunks: 0, cancelled: false };
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (taken.chunks === chunks) return controller.close();
			taken.chunks++;
			controller.enqueue(new Uint8Array(bytesEach).fill(120));
		},
		cancel() {
			taken.cancelled = true;
		},
	});
	const request = new Request("https://forms.test/api", {
		method: "POST",
		body,
		// Node asks for this to send a stream.
		duplex: "half",
	} as RequestInit);
	return { request, taken };
}

describe("reading a request's body", () => {
	it("returns a small body as text", async () => {
		const request = new Request("https://forms.test/api", { method: "POST", body: '{"a":"é"}' });
		expect(await readCapped(request, 100)).toBe('{"a":"é"}');
	});

	it("is empty for a request without one", async () => {
		expect(await readCapped(new Request("https://forms.test/api"), 100)).toBe("");
	});

	it("refuses on the announced size, without reading any of it", async () => {
		const { request, taken } = chunked(10, 1_000);
		request.headers.set("Content-Length", "10000");
		await expect(readCapped(request, 100)).rejects.toBeInstanceOf(TooLarge);
		// A stream holds one chunk ready before anyone reads. Nothing was read from it.
		expect(request.bodyUsed).toBe(false);
		expect(taken.chunks).toBeLessThanOrEqual(1);
	});

	it("refuses a size that is not a number", async () => {
		const { request } = chunked(1, 10);
		request.headers.set("Content-Length", "lots");
		await expect(readCapped(request, 100)).rejects.toBeInstanceOf(TooLarge);
		expect(request.bodyUsed).toBe(false);
	});

	it("stops reading a body that does not announce its size once it passes the limit", async () => {
		// A megabyte on offer, a kilobyte allowed.
		const { request, taken } = chunked(1_000, 1_000);
		expect(request.headers.get("Content-Length")).toBeNull();
		await expect(readCapped(request, 1_024)).rejects.toBeInstanceOf(TooLarge);
		// Two chunks pass the limit. A stream may have one more ready; no more than that is taken.
		expect(taken.chunks).toBeLessThanOrEqual(4);
		expect(taken.cancelled).toBe(true);
	});

	it("counts bytes, not characters", async () => {
		const request = new Request("https://forms.test/api", { method: "POST", body: "ééééé" });
		request.headers.delete("Content-Length");
		await expect(readCapped(request, 9)).rejects.toBeInstanceOf(TooLarge);
	});

	it("reads a chunked body that fits", async () => {
		const { request } = chunked(3, 4);
		expect(await readCapped(request, 12)).toBe("x".repeat(12));
	});
});
