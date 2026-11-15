import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";
import { mayMakeAccount, parseAllowList, signUpIsClosed } from "./sign-up-allow";

describe("who may make an account", () => {
	it("is anyone when the setting is unset or empty", () => {
		expect(signUpIsClosed(undefined)).toBe(false);
		expect(signUpIsClosed("  ")).toBe(false);
		expect(mayMakeAccount(undefined, "anyone@example.test")).toBe(true);
	});

	it("is the listed addresses, whatever their case or spacing", () => {
		const setting = "Ada@Example.test,\n  grace@example.test";
		expect(signUpIsClosed(setting)).toBe(true);
		expect(mayMakeAccount(setting, "ada@example.test")).toBe(true);
		expect(mayMakeAccount(setting, " GRACE@example.test ")).toBe(true);
		expect(mayMakeAccount(setting, "bob@example.test")).toBe(false);
	});

	it("does not take a domain: nothing proves who can read mail there", () => {
		const setting = "ada@example.test, @study.example";
		expect(mayMakeAccount(setting, "anyone@study.example")).toBe(false);
		expect(mayMakeAccount(setting, "@study.example")).toBe(false);
		expect(parseAllowList(setting)).toEqual({
			closed: true,
			addresses: ["ada@example.test"],
			ignored: ["@study.example"],
		});
	});

	it("stays closed to everyone when the list holds nothing but domains", () => {
		expect(signUpIsClosed("@study.example")).toBe(true);
		expect(mayMakeAccount("@study.example", "a@study.example")).toBe(false);
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
