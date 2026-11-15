// Builds the app for the browser tests. It is the normal build, plus FORMS_E2E, which makes
// vite.config.ts turn the example forms on: the tests answer the made-up forms in examples/.
// (Run through Node so the variable is set the same way on every platform.)
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const built = spawnSync(
	process.execPath,
	[resolve(root, "node_modules/vite/bin/vite.js"), "build"],
	{ cwd: root, stdio: "inherit", env: { ...process.env, FORMS_E2E: "1" } },
);
process.exit(built.status ?? 1);
