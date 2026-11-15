import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { forward, heading, sidewaysOverflow } from "./helpers";

/**
 * The made-up form with a group of eight items and two questions about each: the shape that a
 * long survey has, and that the bread form, with four items at most, does not.
 */
const HERBS = "/f/windowsill-herbs";

async function toFirstHerb(page: Page): Promise<void> {
	await page.goto(HERBS);
	await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "Eleven herbs")).toBeVisible();
	await forward(page);
	await expect(heading(page, "Basil")).toBeVisible();
	await page
		.locator("[data-card]")
		.evaluate((card) => Promise.all(card.getAnimations().map((animation) => animation.finished)));
}

async function answer(page: Page, label: string): Promise<void> {
	const option = page.locator("label").filter({ hasText: label });
	if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await option.tap();
	else await option.click();
}

/** What the marks of the card are made of, and where they are. */
function marksOf(page: Page) {
	return page.evaluate(() => {
		const marks = document.querySelector("[data-marks=picture]");
		if (!marks) return undefined;
		const dots = [...marks.querySelectorAll("[data-mark]")];
		return {
			dots: dots.length,
			answered: dots.filter((dot) => dot.getAttribute("data-mark") === "answered").length,
			rows: new Set(dots.map((dot) => Math.round(dot.getBoundingClientRect().top))).size,
			hidden: marks.getAttribute("aria-hidden"),
			// Anything a pointer, the Tab key or a script could take for a control.
			pressable: marks.querySelectorAll("button, a, input, [tabindex], [role], [onclick]").length,
			inside: dots.every((dot) => {
				const box = dot.getBoundingClientRect();
				return box.left >= 0 && box.right <= window.innerWidth;
			}),
		};
	});
}

for (const [name, viewport] of [
	["at 320 pixels", { width: 320, height: 568 }],
	["at 390 pixels", { width: 390, height: 844 }],
] as const) {
	test.describe(name, () => {
		test.use({ viewport, isMobile: true, hasTouch: true });

		test("the marks of a long group are a picture in one row, and nothing to press", async ({
			page,
		}) => {
			await toFirstHerb(page);
			await expect(page.getByText("Group 1 of 2: Soft herbs · 1 of 8")).toBeVisible();
			expect(await marksOf(page)).toEqual({
				dots: 8,
				answered: 0,
				rows: 1,
				hidden: "true",
				pressable: 0,
				inside: true,
			});
			expect(await sidewaysOverflow(page)).toBe(0);
			// Screen readers are given the place in words, and no list of marks beside it.
			await expect(page.getByRole("list")).toHaveCount(0);
			await expect(heading(page, "Basil")).toHaveAccessibleDescription(
				"Part 1 of 1 · Eleven herbs Group 1 of 2: Soft herbs · 1 of 8",
			);

			// Two questions about each herb: its mark fills when both have their answer.
			await answer(page, "It is growing now");
			await expect(page.getByText("Do you cook with basil?")).toBeVisible();
			expect((await marksOf(page))?.answered).toBe(0);
			await answer(page, "Often");
			await expect(heading(page, "Parsley")).toBeVisible();
			expect(await marksOf(page)).toMatchObject({ dots: 8, answered: 1, rows: 1, pressable: 0 });

			// A press on the mark of the herb already answered goes nowhere.
			const first = await page.locator("[data-mark]").first().boundingBox();
			if (!first) throw new Error("The mark is not on the page");
			await page.touchscreen.tap(first.x + first.width / 2, first.y + first.height / 2);
			await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
			await page.waitForTimeout(600);
			await expect(heading(page, "Parsley")).toBeVisible();

			// Nothing on the card that can be pressed is smaller than a thumb, marks or no marks.
			const small = await page.evaluate(
				() =>
					[...document.querySelectorAll("button, summary, label:has(input), a")]
						.filter((control) => control.getClientRects().length > 0)
						.map((control) => control.getBoundingClientRect())
						.filter((box) => Math.round(box.height) < 44 || Math.round(box.width) < 44).length,
			);
			expect(small).toBe(0);
			expect(await sidewaysOverflow(page)).toBe(0);
		});
	});
}

test("the Tab key does not stop at the marks of a long group", async ({ page, isMobile }) => {
	test.skip(isMobile, "A phone has no keyboard to answer with");
	await toFirstHerb(page);
	await page.keyboard.press("1");
	await expect(page.getByText("Do you cook with basil?")).toBeVisible();
	await page.keyboard.press("1");
	await expect(heading(page, "Parsley")).toBeFocused();
	// Back from the heading: straight to the header's menu, past the marks.
	await page.keyboard.press("Shift+Tab");
	await expect(page.getByRole("button", { name: "Options" })).toBeFocused();
});

test("the look back asks each question in the item's own words", async ({ page }) => {
	await toFirstHerb(page);
	await answer(page, "I did, and gave up");
	await expect(page.getByText("Do you cook with basil?")).toBeVisible();
	await answer(page, "Now and then");
	await expect(heading(page, "Parsley")).toBeVisible();
	// Passed without answers. Two cards in a row have the same heading here, so a new card is
	// told by its heading being a new element, not by what it says.
	const card = () => page.getByRole("heading", { level: 1 }).getAttribute("aria-describedby");
	for (let passed = 0; passed < 14; passed++) {
		const before = await card();
		await forward(page);
		await expect.poll(card).not.toBe(before);
	}
	await expect(heading(page, "Your answers: Soft herbs")).toBeVisible();

	// Two lines for each herb, each saying which of the two questions it is, by the herb's name.
	const lines = page.getByRole("listitem");
	await expect(lines).toHaveCount(16);
	await expect(lines.nth(0)).toHaveText(
		/Basil: Have you grown basil indoors\?\s*I did, and gave up/,
	);
	await expect(lines.nth(1)).toHaveText(/Basil: Do you cook with basil\?\s*Now and then/);
	await expect(lines.nth(15)).toHaveText(/Chervil: Do you cook with chervil\?\s*No answer/);
	await expect(
		page.getByRole("button", { name: "Basil: Do you cook with basil?: Now and then. Change" }),
	).toBeVisible();
	// A merge field that was left as written would show its braces.
	await expect(page.locator("body")).not.toContainText("{{");
});

/** WCAG's contrast ratio between two colours, the first drawn over the second. */
function contrastOf(page: Page, selector: string): Promise<number> {
	return page.evaluate((marks) => {
		const mark = document.querySelector(marks);
		const card = document.querySelector("[data-card]");
		if (!mark || !card) return 0;
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const paint = canvas.getContext("2d", { willReadFrequently: true });
		if (!paint) return 0;
		const luminance = (color: string, over: string) => {
			paint.fillStyle = over;
			paint.fillRect(0, 0, 1, 1);
			paint.fillStyle = color;
			paint.fillRect(0, 0, 1, 1);
			const [red = 0, green = 0, blue = 0] = paint.getImageData(0, 0, 1, 1).data;
			const linear = (channel: number) => {
				const value = channel / 255;
				return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
		};
		const surface = getComputedStyle(card).backgroundColor;
		const behind = getComputedStyle(document.body).backgroundColor;
		const ofMark = luminance(getComputedStyle(mark).borderTopColor, surface);
		const ofCard = luminance(surface, behind);
		return (Math.max(ofMark, ofCard) + 0.05) / (Math.min(ofMark, ofCard) + 0.05);
	}, selector);
}

for (const colorScheme of ["light", "dark"] as const) {
	test(`a mark that waits for its answer stands out from the card, in ${colorScheme}`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		await toFirstHerb(page);
		await answer(page, "It is growing now");
		await answer(page, "Often");
		await expect(heading(page, "Parsley")).toBeVisible();
		// The marks still to come, the one on the card, and the one that has its answer.
		const open = await contrastOf(page, "[data-mark=open]:not(.border-brand)");
		const current = await contrastOf(page, "[data-mark=open].border-brand");
		const answered = await contrastOf(page, "[data-mark=answered]");
		console.log(
			`marks against the card, ${colorScheme}: waiting ${open.toFixed(2)}:1, current ${current.toFixed(2)}:1, answered ${answered.toFixed(2)}:1`,
		);
		// WCAG 1.4.11: 3 to 1 for what carries information without being text.
		for (const ratio of [open, current, answered]) expect(ratio).toBeGreaterThanOrEqual(3);
	});
}
