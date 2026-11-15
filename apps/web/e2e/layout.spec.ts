import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
	CONSENT,
	choose,
	forward,
	heading,
	open,
	sidewaysOverflow,
	skipTo,
	start,
} from "./helpers";

/**
 * The controls on the page that are smaller than 44 by 44 CSS pixels, each described. WCAG asks
 * for 24 at its AA level and 44 at AAA; a form answered with a thumb gets the larger one.
 */
function smallTargets(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const controls = document.querySelectorAll(
			"button, summary, select, textarea, input[type=text], input[type=email], label:has(input)",
		);
		return [...controls]
			.filter((control) => control.getClientRects().length > 0)
			.map((control) => ({ control, box: control.getBoundingClientRect() }))
			.filter(({ box }) => Math.round(box.height) < 44 || Math.round(box.width) < 44)
			.map(
				({ control, box }) =>
					`${control.tagName} "${(control.textContent ?? "").trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
			);
	});
}

async function expectFits(page: Page): Promise<void> {
	expect(await sidewaysOverflow(page)).toBe(0);
	expect(await smallTargets(page)).toEqual([]);
}

/** Every kind of screen the form has, each checked with `check` as it is reached. */
async function everyScreen(page: Page, check: () => Promise<void>): Promise<void> {
	await open(page);
	await check();
	await page.getByLabel(CONSENT).check();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "You and your kitchen")).toBeVisible();
	await check();

	// The questions of the first leg: every type of input is among them.
	for (let cards = 0; cards < 8; cards++) {
		await forward(page);
		await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
		await check();
	}
	// The ticked state of the widest list, with the line of text an option asks for.
	await skipTo(page, "Nine breads");
	await check();
	await forward(page);
	await page.getByText("More about it").click();
	await check();
	await choose(page, "Used to make it, but stopped");
	await skipTo(page, /You stopped making 1 of these/);
	await check();
	await forward(page);
	await choose(page, "Another reason");
	await check();

	await page.getByRole("button", { name: "Continue on another device" }).click();
	await check();
	await page.getByRole("button", { name: "Close" }).click();

	await skipTo(page, "Thank you");
	await page.getByRole("textbox").fill("reader@example.test");
	await check();
}

test.describe("on the narrowest phone", () => {
	// 320 CSS pixels is also what WCAG's reflow criterion measures: a desk window at 400% zoom.
	test.use({ viewport: { width: 320, height: 568 } });

	test("nothing scrolls sideways, and every control is big enough for a thumb", async ({
		page,
	}) => {
		await everyScreen(page, () => expectFits(page));
	});
});

test.describe("in a desk window zoomed to 200%", () => {
	// A 1280 by 720 window at 200% lays out as one of 640 by 360.
	test.use({ viewport: { width: 640, height: 360 }, isMobile: false, hasTouch: false });

	test("nothing scrolls sideways", async ({ page }) => {
		await everyScreen(page, async () => {
			expect(await sidewaysOverflow(page)).toBe(0);
		});
	});
});

test("follows the device's light or dark theme", async ({ page }) => {
	const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	await page.emulateMedia({ colorScheme: "light" });
	await start(page);
	const light = await background();
	await page.emulateMedia({ colorScheme: "dark" });
	const dark = await background();
	expect(dark).not.toBe(light);
	// Text and background swap, so the page is still readable: the heading is the lighter one now.
	const lightness = (color: string) => Number(/oklch\(([\d.]+)/.exec(color)?.[1] ?? Number.NaN);
	const text = await page.evaluate(() => getComputedStyle(document.body).color);
	expect(lightness(text)).toBeGreaterThan(lightness(dark));
});
