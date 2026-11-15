import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflare({
			// At the repository root, where the siblings keep theirs (see wrangler.jsonc).
			configPath: "../../wrangler.jsonc",
			viteEnvironment: { name: "ssr" },
			// The browser tests keep their data apart from `pnpm dev` (see e2e/server.mjs).
			persistState: process.env.FORMS_STATE_DIR ? { path: process.env.FORMS_STATE_DIR } : true,
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		rootDeployConfig(),
	],
});

/**
 * Wrangler finds the build output through .wrangler/deploy/config.json, which the Cloudflare
 * plugin writes next to this file. Wrangler deploys from the repository root, where its config
 * is, and Workers Builds runs its own commands there too, so the root needs a copy that points
 * at the same output.
 */
function rootDeployConfig(): Plugin {
	return {
		name: "forms:root-deploy-config",
		apply: "build",
		applyToEnvironment: (environment) => environment.name === "ssr",
		writeBundle: {
			order: "post",
			sequential: true,
			handler() {
				const from = join(this.environment.config.root, ".wrangler", "deploy");
				const to = fileURLToPath(new URL("../../.wrangler/deploy", import.meta.url));
				const rebase = (path: string) => relative(to, resolve(from, path));
				const config = JSON.parse(readFileSync(join(from, "config.json"), "utf8"));
				config.configPath = rebase(config.configPath);
				if (config.prerenderWorkerConfigPath) {
					config.prerenderWorkerConfigPath = rebase(config.prerenderWorkerConfigPath);
				}
				config.auxiliaryWorkers = (config.auxiliaryWorkers ?? []).map(
					(worker: { configPath: string }) => ({ configPath: rebase(worker.configPath) }),
				);
				mkdirSync(to, { recursive: true });
				writeFileSync(join(to, "config.json"), JSON.stringify(config));
			},
		},
	};
}
