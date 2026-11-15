import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Forms, startForms } from "./forms-worker";

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

describe("the pages", () => {
	it("lists the example forms on the first page, where the server serves them", async () => {
		const home = await forms.fetch("/");
		expect(home.status).toBe(200);
		const html = await home.text();
		expect(html).toContain("Bread at home");
		expect(html).toContain('href="/f/home-baking"');
	});

	it("serves a form's first page with its consent, and none of its questions", async () => {
		const page = await forms.fetch("/f/home-baking");
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain("<title>Bread at home · Gateweave Forms</title>");
		expect(html).toContain("I have read this and agree to take part.");
		// The page is rendered on the server, and a press on Start before its script has run would
		// submit the form the browser's own way. So the button arrives disabled.
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Start<\/button>/);
	});

	it("answers 404 for a form that does not exist", async () => {
		const page = await forms.fetch("/f/nope");
		expect(page.status).toBe(404);
		expect(await page.text()).toContain("There is no such form");
	});

	it("serves a response's page without reading who asks: the secret never reaches the server", async () => {
		// The address of a response that does not exist. The page is the same for every response:
		// what opens one is in the fragment, which is read in the browser.
		const page = await forms.fetch("/f/home-baking/r/AAAAAAAAAAAAAAAA");
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("Loading your answers");
	});

	it("keeps pages out of search engines", async () => {
		const html = await (await forms.fetch("/f/home-baking")).text();
		expect(html).toMatch(/<meta name="robots" content="noindex"/);
	});

	it("lets a page load nothing but its own files", async () => {
		const page = await forms.fetch("/f/home-baking");
		const policy = page.headers.get("Content-Security-Policy") ?? "";
		expect(policy).toContain("default-src 'none'");
		expect(policy).toMatch(/script-src 'self' 'nonce-[^']+'/);
		expect(policy).toContain("style-src 'self'");
		expect(policy).toContain("frame-ancestors 'none'");
		expect(policy).not.toContain("unsafe");
		expect(page.headers.get("Cache-Control")).toBe("private, no-store");
		expect(page.headers.get("X-Content-Type-Options")).toBe("nosniff");
		// Every inline script of the page carries the nonce the policy names.
		const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
		const scripts = [...(await page.text()).matchAll(/<script\b([^>]*)>/g)];
		expect(scripts.length).toBeGreaterThan(0);
		for (const [, attributes] of scripts) {
			if (!attributes?.includes("src=")) expect(attributes).toContain(`nonce="${nonce}"`);
		}
	});
});

describe("the browser's bundle", () => {
	it("holds none of the server's code", () => {
		const assets = resolve(import.meta.dirname, "../dist/client/assets");
		const scripts = readdirSync(assets).filter((name) => name.endsWith(".js"));
		expect(scripts.length).toBeGreaterThan(0);
		const bundle = scripts.map((name) => readFileSync(join(assets, name), "utf8")).join("\n");
		// Text that exists only in src/server and survives minifying: the names of a column and a
		// table, what a secret signs, and the import that only a Worker has.
		const markers = [
			"secret_seal",
			"detached_answer",
			"gateweave-forms response",
			"cloudflare:workers",
		];
		for (const marker of markers) expect(bundle, marker).not.toContain(marker);
		// And the check itself can see such text: the app's own strings are in the bundle.
		expect(bundle).toContain("Continue on another device");
	});
});
