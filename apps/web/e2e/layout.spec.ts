import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
	CONSENT,
	choose,
	FORM,
	forward,
	heading,
	open,
	sidewaysOverflow,
	skipTo,
	start,
} from "./helpers";
import { bringIn, freshId, respond, signUp, tab } from "./owner";

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
	await page.getByRole("button", { name: "Options" }).click();
	await check();
	await page.getByRole("button", { name: "Continue on another device" }).click();
	await check();
	await page.getByRole("button", { name: "Close" }).click();
	// The ticked state of the widest list, with the line of text an option asks for.
	await skipTo(page, "Nine breads");
	await check();
	await forward(page);
	await page.getByText("More about it").click();
	await check();
	await choose(page, "Used to make it, but stopped");
	// The second item's card has a mark to go back by.
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await check();
	await skipTo(page, "Your answers: Loaves");
	await check();
	await skipTo(page, /You stopped making 1 of these/);
	await check();
	await forward(page);
	await choose(page, "Another reason");
	await check();
	await skipTo(page, "Flatbreads");
	await check();

	await skipTo(page, "Thank you");
	await page.getByRole("textbox").fill("reader@example.test");
	await page.getByText("What you answered").click();
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

/**
 * What a respondent can do about their own answers, and the pages of someone who runs a form.
 * The same two measures as the cards: nothing scrolls sideways, and every control takes a thumb.
 */
async function respondentsOwn(page: Page, check: () => Promise<void>): Promise<void> {
	// The consent on a page of its own.
	await page.goto(`${FORM}/consent`);
	await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled();
	await check();

	// The options in the header, with the entry for one's own answers, and its dialog.
	await start(page);
	await page.getByRole("button", { name: "Options" }).click();
	await check();
	await page.getByRole("button", { name: "Your answers and this device" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await check();
	await page.getByRole("dialog").getByRole("button", { name: "Delete my answers" }).click();
	await check();
	await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

	// The first page of a form this browser has begun: continue, or forget.
	await open(page);
	await expect(page.getByRole("button", { name: "Forget it on this device" })).toBeVisible();
	await check();
}

async function ownersPages(
	page: Page,
	browser: Browser,
	id: string,
	check: () => Promise<void>,
): Promise<void> {
	await page.goto("/login");
	await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
	await check();
	await signUp(page);
	await check();
	await page.getByRole("link", { name: "New form" }).click();
	await check();
	await page.getByLabel("A Tally form's page").check();
	await check();
	await page.getByLabel("A definition (JSON)").check();
	await page.goto("/forms");
	await bringIn(page, id);
	// Settings: the state, the versions, a new definition, deleting.
	await check();
	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();
	await respond(browser, id, "A lot", { finish: true });
	await respond(browser, id, "Very little", { finish: false });

	await page.getByRole("button", { name: "Close it" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await check();
	await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

	await tab(page, "Overview").click();
	await expect(page.getByTestId("started")).toHaveText("2");
	await check();
	await page.getByText("The last question each got to").click();
	await check();
	for (const name of ["Items", "Questions", "Responses"]) {
		await tab(page, name).click();
		await expect(page.getByTestId("counted")).toBeVisible();
		await check();
	}
	await page.locator("[data-response]").first().click();
	await expect(page.getByRole("button", { name: "Delete this response" })).toBeVisible();
	await check();
	await tab(page, "Kept apart").click();
	await expect(page.getByRole("status")).toBeVisible();
	await check();
	await page.goto("/account");
	await expect(page.getByRole("button", { name: "Change password" })).toBeEnabled();
	await check();
}

test.describe("what this slice added, on the narrowest phone", () => {
	test.use({ viewport: { width: 320, height: 568 } });

	test("a respondent's own answers: nothing scrolls sideways, every control takes a thumb", async ({
		page,
	}) => {
		await respondentsOwn(page, () => expectFits(page));
	});

	test("the pages of someone who runs a form: the same", async ({ page, browser }, info) => {
		await ownersPages(page, browser, freshId(info), () => expectFits(page));
	});
});

test.describe("what this slice added, in a desk window zoomed to 200%", () => {
	test.use({ viewport: { width: 640, height: 360 }, isMobile: false, hasTouch: false });

	test("nothing scrolls sideways", async ({ page, browser }, info) => {
		const check = async () => {
			expect(await sidewaysOverflow(page)).toBe(0);
		};
		await respondentsOwn(page, check);
		await ownersPages(page, browser, freshId(info), check);
	});
});
