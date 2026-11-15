import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { plantForm } from "../test/made-up";
import { expect } from "./fixtures";
import { choose, forward, heading, skipTo, stored } from "./helpers";

/** An id no other test or project uses: they share one server and one database. */
export function freshId(info: TestInfo): string {
	return `plants-${info.project.name}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Makes an account and lands on its list of forms. */
export async function signUp(page: Page): Promise<void> {
	await page.goto("/login");
	// The page arrives before its script: the buttons work once this one is enabled.
	await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
	await page.getByRole("button", { name: "Create account" }).click();
	await page.getByLabel("Name").fill("Made-up Owner");
	await page
		.getByLabel("Email")
		.fill(`owner-${Math.random().toString(36).slice(2, 10)}@example.test`);
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page.getByRole("heading", { level: 1, name: "Your forms" })).toBeVisible();
}

/** One of a form's tabs. The overview's export links have names that begin the same. */
export function tab(page: Page, name: string): Locator {
	return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

/** Brings the made-up plant form in from its definition and opens it for answers. */
export async function bringIn(page: Page, id: string): Promise<void> {
	await page.getByRole("link", { name: "New form" }).click();
	await page.getByLabel("Or paste it").fill(JSON.stringify(plantForm(id)));
	await page.getByRole("button", { name: "Check it" }).click();
	const outline = page.getByRole("region", { name: "What it becomes" });
	await expect(outline).toContainText(`Its address will be /f/${id}`);
	await expect(outline).toContainText("5 items in 2 groups (3, 2), 2 questions for each");
	await outline.getByRole("button", { name: "Bring it in as a draft" }).click();
	await expect(page).toHaveURL(new RegExp(`/forms/${id}/settings$`));
	await expect(page.getByText("This form is a draft.")).toBeVisible();
}

/** Answers the plant form in a browser of its own, as someone with only its link would. */
export async function respond(
	browser: Browser,
	id: string,
	light: string,
	{ finish }: { finish: boolean },
): Promise<void> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`/f/${id}`);
	await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "Your home")).toBeVisible();
	await forward(page);
	await expect(heading(page, "How much light does your home get?")).toBeVisible();
	await choose(page, light);
	await forward(page);
	await expect(heading(page, "How many plants do you have?")).toBeVisible();
	if (finish) await skipTo(page, "Thank you");
	// An answer is sent after the next card is shown. Closing the browser before it has
	// arrived would drop it, and the owner's pages would count a response that answered nothing.
	await expect.poll(async () => (await stored(page)).answers.questions.light?.value).toBeTruthy();
	await context.close();
}
