import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";
import { mayMakeAccount, signUpIsClosed } from "./sign-up-allow";

describe("who may make an account", () => {
	it("is anyone when the setting is unset or empty", () => {
		expect(signUpIsClosed(undefined)).toBe(false);
		expect(signUpIsClosed("  ")).toBe(false);
		expect(mayMakeAccount(undefined, "anyone@example.test")).toBe(true);
	});

	it("is the listed addresses and domains, whatever their case or spacing", () => {
		const setting = "Ada@Example.test, @study.example\n  grace@example.test";
		expect(signUpIsClosed(setting)).toBe(true);
		expect(mayMakeAccount(setting, "ada@example.test")).toBe(true);
		expect(mayMakeAccount(setting, " GRACE@example.test ")).toBe(true);
		expect(mayMakeAccount(setting, "anyone@study.example")).toBe(true);
		expect(mayMakeAccount(setting, "bob@example.test")).toBe(false);
	});

	it("does not take a subdomain, or a longer name, for a listed domain", () => {
		expect(mayMakeAccount("@study.example", "a@lab.study.example")).toBe(false);
		expect(mayMakeAccount("@study.example", "a@notstudy.example")).toBe(false);
		expect(mayMakeAccount("@study.example", "a@study.example.evil.test")).toBe(false);
	});
});

describe("where to go after signing in", () => {
	it("is a path on this site, and nothing else", () => {
		expect(safeRedirect("/forms/tea?v=1#top")).toBe("/forms/tea?v=1#top");
		expect(safeRedirect("https://evil.test/")).toBeNull();
		expect(safeRedirect("//evil.test/")).toBeNull();
		expect(safeRedirect("/\\evil.test")).toBeNull();
		expect(safeRedirect(undefined)).toBeNull();
	});
});
