import { expect, test } from "./fixtures";
import { FORM, forward, heading, open, start } from "./helpers";

/** The made-up form without a consent text: a first page with next to nothing on it. */
const HERBS = "/f/windowsill-herbs";

test.describe("the first page on a phone", () => {
	test.skip(({ isMobile }) => !isMobile, "The bar stays at the bottom on a phone only.");

	test("puts Start across the bottom, within reach of either thumb", async ({ page }) => {
		await page.goto(HERBS);
		const button = page.getByRole("button", { name: "Start" });
		await expect(button).toBeEnabled();
		const box = await button.boundingBox();
		const screen = page.viewportSize();
		if (!box || !screen) throw new Error("no button or no screen");
		// As near the left edge as the right, so neither hand has to cross the screen for it.
		expect(box.x).toBeLessThanOrEqual(16);
		expect(screen.width - (box.x + box.width)).toBeLessThanOrEqual(16);
		// And at the bottom, where a thumb rests, not under the title at the top.
		expect(box.y + box.height).toBeGreaterThan(screen.height - 32);
		// The little there is to read stands in the middle rather than in the top corner.
		const title = await heading(page, "Herbs on the windowsill").boundingBox();
		expect(title?.y ?? 0).toBeGreaterThan(screen.height * 0.2);
	});

	test("keeps Start on screen under a consent text longer than the screen", async ({ page }) => {
		await open(page);
		await expect(page.getByRole("button", { name: "Start" })).toBeInViewport({ ratio: 1 });
	});

	test("offers to continue first and to start again second, both across the bottom", async ({
		page,
	}) => {
		await start(page);
		await forward(page);
		await page.goto(FORM);
		const resume = page.getByRole("button", { name: "Continue where you stopped" });
		const again = page.getByRole("button", { name: "Start again" });
		await expect(resume).toBeInViewport({ ratio: 1 });
		await expect(again).toBeInViewport({ ratio: 1 });
		const [first, second] = [await resume.boundingBox(), await again.boundingBox()];
		const screen = page.viewportSize();
		if (!first || !second || !screen) throw new Error("no buttons or no screen");
		expect(first.y).toBeLessThan(second.y);
		for (const box of [first, second]) {
			expect(box.width).toBeGreaterThan(screen.width - 32);
			expect(box.height).toBeGreaterThanOrEqual(44);
		}
	});
});

test("says something true on a first page that has no consent text", async ({ page }) => {
	await page.goto(HERBS);
	await expect(
		page.getByText("Your answers are saved as you give them, so you can stop and continue later."),
	).toBeVisible();
});
