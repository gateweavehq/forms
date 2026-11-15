import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				// The app's pure logic, in Node. The Cloudflare and TanStack Start plugins from
				// vite.config.ts are deliberately left out.
				resolve: { tsconfigPaths: true },
				test: { name: "unit", include: ["src/**/*.test.ts"] },
			},
		],
	},
});
