/** Thrown when a body is, or says it is, larger than allowed. */
export class TooLarge extends Error {}

/**
 * A request's body as text, read only as far as `maxBytes`.
 *
 * A body that announces its size is refused on the announcement, before a byte of it is read.
 * One that does not (it arrives in chunks) is read through a counter that stops, and cancels
 * the rest, as soon as the limit is passed. Reading the whole body first and measuring it
 * afterwards would let anyone make the Worker hold as much as they care to send.
 */
export async function readCapped(request: Request, maxBytes: number): Promise<string> {
	const announced = request.headers.get("Content-Length");
	if (announced !== null && !(Number(announced) <= maxBytes)) throw new TooLarge();
	if (!request.body) return "";

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			throw new TooLarge();
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}
