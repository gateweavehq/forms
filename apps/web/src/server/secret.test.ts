import { describe, expect, it } from "vitest";
import { randomToken, sealSecret, secretMatches } from "./secret";

describe("a response's secret", () => {
	it("is random, and safe in an address", () => {
		const token = randomToken(32);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(randomToken(32)).not.toBe(token);
	});

	it("is proved by its seal, which is not the secret", async () => {
		const secret = randomToken(32);
		const seal = await sealSecret("response-1", secret);
		expect(seal).not.toContain(secret);
		expect(await secretMatches("response-1", secret, seal)).toBe(true);
	});

	it("is refused when it is another one, or empty", async () => {
		const seal = await sealSecret("response-1", randomToken(32));
		expect(await secretMatches("response-1", randomToken(32), seal)).toBe(false);
		expect(await secretMatches("response-1", "", seal)).toBe(false);
	});

	it("opens only its own response", async () => {
		const secret = randomToken(32);
		const seal = await sealSecret("response-1", secret);
		expect(await secretMatches("response-2", secret, seal)).toBe(false);
	});

	it("is refused against a seal that is not one", async () => {
		expect(await secretMatches("response-1", "secret", "not base64 %%%")).toBe(false);
		expect(await secretMatches("response-1", "secret", "")).toBe(false);
	});
});
