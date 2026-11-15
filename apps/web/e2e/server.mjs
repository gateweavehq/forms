// Starts the built app for the browser tests: `vite preview` on port 4771, or FORMS_E2E_PORT as
// playwright.config.ts reads it, with its own empty local database. It runs from Playwright's
// `webServer`, so it works the same on a laptop and in CI. Run `vite build` first.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);
const port = Number(process.env.FORMS_E2E_PORT) || 4771;

// Kept apart from `pnpm dev` data, and wiped on every start so each run begins empty. One folder
// per port, so two checkouts' runs do not wipe each other's.
const state = resolve(root, ".wrangler", `e2e-state-${port}`);
rmSync(state, { recursive: true, force: true });

// A Worker without the secret that signs sessions serves nothing. A preview reads it from beside
// the built Worker; the tests get one of their own, and the .dev.vars at the repository root is
// left alone.
writeFileSync(
	resolve(root, "dist/server/.dev.vars"),
	`BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\n`,
);

// Run the tools with this Node, not through a shell: Playwright stops the server by killing this
// process, and a shell in between would leave the server running (and Playwright waiting).
const migrated = spawnSync(
	process.execPath,
	[
		resolve(root, "node_modules/wrangler/bin/wrangler.js"),
		...["d1", "migrations", "apply", "DB", "--local", "--persist-to", state],
	],
	{ stdio: "inherit" },
);
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

const server = spawn(
	process.execPath,
	[
		resolve(root, "node_modules/vite/bin/vite.js"),
		...["preview", "--port", String(port), "--strictPort"],
	],
	{ stdio: "inherit", env: { ...process.env, FORMS_STATE_DIR: state } },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
