import { expect, test } from "./fixtures";
import { choose, forward, heading, stored } from "./helpers";

// The second made-up form: no consent step, and a question that needs an answer.
test("starts a form without a consent step, and holds a required question until it is answered", async ({
	page,
}) => {
	await page.goto("/f/quick-feedback");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Two questions about this page");
	await expect(page.getByRole("checkbox")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "Your view")).toBeVisible();
	await forward(page);

	// It cannot be skipped: the button says Next, and pressing it says what is missing.
	await expect(heading(page, "Did you find what you came for?")).toBeVisible();
	await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
	await forward(page);
	await expect(page.getByRole("alert")).toHaveText("This question needs an answer.");
	await expect(heading(page, "Did you find what you came for?")).toBeVisible();

	// "Yes" closes the question after it, which makes this one the last.
	await choose(page, "Partly");
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
	await choose(page, "Yes");
	await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
	await forward(page);

	// A form with no end of its own gets the product's, and nothing is asked apart.
	await expect(heading(page, "Thank you")).toBeVisible();
	await expect(page.getByText("Your answers are saved. You can close this page.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
	const response = await stored(page);
	expect(response.completed).toBe(true);
	expect(response.answers.questions).toMatchObject({ found: { value: { option: "yes" } } });
});

test("says so when a form does not exist", async ({ page }) => {
	const response = await page.goto("/f/no-such-form");
	expect(response?.status()).toBe(404);
	await expect(page.getByRole("heading", { name: "There is no such form" })).toBeVisible();
});

test("lists the forms on the first page", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { level: 1, name: "Gateweave Forms" })).toBeVisible();
	await page.getByRole("link", { name: "Bread at home" }).click();
	await expect(page.getByRole("heading", { level: 1, name: "Bread at home" })).toBeVisible();
});
