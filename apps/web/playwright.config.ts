import { defineConfig, devices } from "@playwright/test";

// Port 4771 keeps clear of `pnpm dev` (4770). The tests run against the production build, which
// is what answers with the page's security policy. FORMS_E2E_PORT moves them (4772 to 4779), so
// two checkouts can run them at once.
const PORT = Number(process.env.FORMS_E2E_PORT) || 4771;

export default defineConfig({
	testDir: "e2e",
	timeout: 60_000,
	expect: { timeout: 10_000 },
	// Tests share one server but never data: every test starts its own response.
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	// A form is answered on a phone as often as at a desk, and the two are not the same page:
	// touch against a keyboard, one narrow column against a wide one. Every test runs on both.
	projects: [
		{
			name: "phone",
			use: {
				browserName: "chromium",
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			},
		},
		{ name: "desk", use: { ...devices["Desktop Chrome"] } },
	],
	webServer: {
		command: "node e2e/server.mjs",
		url: `http://localhost:${PORT}/`,
		reuseExistingServer: false,
		timeout: 120_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
