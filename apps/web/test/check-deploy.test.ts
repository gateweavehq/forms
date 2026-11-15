import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const app = resolve(import.meta.dirname, "..");
const script = join(app, "scripts/check-deploy.mjs");
const folder = mkdtempSync(join(tmpdir(), "forms-deploy-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function check(config: unknown | undefined, name: string) {
	const path = join(folder, name);
	if (config !== undefined) writeFileSync(path, JSON.stringify(config));
	return spawnSync(process.execPath, [script, path], { encoding: "utf8" });
}

describe("the check a deploy runs on its build", () => {
	it("stops a build that serves the example forms, and says what to do", () => {
		const result = check({ name: "forms", vars: { FORMS_EXAMPLES: "1" } }, "examples.json");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Not deploying");
		expect(result.stderr).toContain("FORMS_EXAMPLES");
		expect(result.stderr).toContain("FORMS_E2E");
	});

	it("lets a build without the switch through, whatever else it sets", () => {
		expect(check({ name: "forms" }, "none.json").status).toBe(0);
		expect(check({ vars: { SIGN_UP_ALLOW: "ada@example.test" } }, "other.json").status).toBe(0);
	});

	it("stops when there is no build to check", () => {
		const result = check(undefined, "missing.json");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("could not be read");
	});

	it("is run by every script that deploys, after the build and before the deploy", () => {
		const { scripts } = JSON.parse(readFileSync(join(app, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		const deploying = Object.entries(scripts).filter(([, command]) =>
			/wrangler (deploy|versions upload)/.test(command),
		);
		expect(deploying.length).toBeGreaterThan(0);
		for (const [name, command] of deploying) {
			expect(command, name).toMatch(
				/vite build.*&& node scripts\/check-deploy\.mjs && wrangler (deploy|versions upload)/,
			);
		}
	});

	it("passes the build these tests run against, which gets its examples as a setting", () => {
		const built = spawnSync(process.execPath, [script, join(app, "dist/server/wrangler.json")], {
			encoding: "utf8",
		});
		expect(built.stderr).toBe("");
		expect(built.status).toBe(0);
	});
});
