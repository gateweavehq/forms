import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, newNonce, withSecurityHeaders } from "./security-headers";

function page(): Response {
	return new Response("<!doctype html>", {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

describe("security headers", () => {
	it("makes a different nonce every time", () => {
		expect(newNonce()).not.toBe(newNonce());
	});

	it("lets a page load only its own files and the scripts carrying its nonce", () => {
		const policy = contentSecurityPolicy("abc");
		expect(policy).toContain("default-src 'none'");
		expect(policy).toContain("script-src 'self' 'nonce-abc'");
		expect(policy).toContain("frame-ancestors 'none'");
		expect(policy).not.toContain("unsafe");
	});

	it("gives a page its policy and keeps it out of caches", () => {
		const secured = withSecurityHeaders(new Request("https://forms.test/"), page(), "abc");
		expect(secured.headers.get("Content-Security-Policy")).toContain("'nonce-abc'");
		expect(secured.headers.get("Cache-Control")).toBe("private, no-store");
		expect(secured.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(secured.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
	});

	it("leaves JSON without a page's policy, and plain http without HSTS", () => {
		const secured = withSecurityHeaders(
			new Request("http://localhost:4770/api"),
			Response.json({ ok: true }),
			"abc",
		);
		expect(secured.headers.get("Content-Security-Policy")).toBeNull();
		expect(secured.headers.get("Strict-Transport-Security")).toBeNull();
		expect(secured.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});
});
