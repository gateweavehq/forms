import { describe, expect, it } from "vitest";
import { duration, moment, percent, rounded } from "./format";

describe("what the results pages write", () => {
	it("writes a time in seconds, and in minutes from a minute up", () => {
		expect(duration(400)).toBe("0 s");
		expect(duration(45_400)).toBe("45 s");
		expect(duration(60_000)).toBe("1 min");
		expect(duration(200_000)).toBe("3 min 20 s");
	});

	it("writes a share as a whole percentage", () => {
		expect(percent(0.5)).toBe("50%");
		expect(percent(1 / 3)).toBe("33%");
	});

	it("writes a moment the same on the server and in any browser", () => {
		expect(moment(Date.UTC(2026, 0, 2, 3, 4))).toBe("2026-01-02 03:04 UTC");
	});

	it("keeps one decimal of a number", () => {
		expect(rounded(34 / 3)).toBe("11.3");
		expect(rounded(10)).toBe("10");
	});
});
