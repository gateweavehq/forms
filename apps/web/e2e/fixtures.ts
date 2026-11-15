import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ nothingRefused: undefined }>({
	// A script or style a page's policy blocks leaves a page that can look right and do nothing.
	// So in every test here, a refusal is a failure, and so is an error the page did not catch.
	nothingRefused: [
		async ({ context }, use) => {
			const refused: string[] = [];
			context.on("console", (message) => {
				if (message.text().includes("Content Security Policy")) refused.push(message.text());
			});
			context.on("weberror", (error) => refused.push(String(error.error())));
			await use(undefined);
			expect(refused).toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };
