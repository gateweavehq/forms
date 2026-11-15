import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
	],
});
