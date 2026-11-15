import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strings } from "./strings";

/**
 * What the storage of a detached answer gives is "nothing that names your response". An operator
 * could still pair the two (docs/architecture.md says how), so these words promise too much.
 */
const TOO_MUCH = /cannot be linked|can ?not be linked|unlinkable|anonymous|nothing that links/i;

describe("what the app and its examples promise", () => {
	it("is never more than the storage gives", () => {
		expect(JSON.stringify(strings)).not.toMatch(TOO_MUCH);
		const examples = new URL("../../../../examples/", import.meta.url);
		for (const file of readdirSync(examples)) {
			expect(readFileSync(new URL(file, examples), "utf8"), file).not.toMatch(TOO_MUCH);
		}
	});

	it("says what is true of a detached answer", () => {
		expect(strings.end.detachedBody).toContain("without anything that names your response");
	});
});
