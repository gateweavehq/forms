import { expect, test } from "./fixtures";
import { CONSENT, FORM, heading, open, skipTo, start } from "./helpers";

test("withdraws a response that is not finished, and its answers are gone", async ({ page }) => {
	await start(page);
	const url = new URL(page.url());
	const id = url.pathname.split("/").pop() ?? "";
	const headers = { Authorization: `Bearer ${url.hash.slice(1)}` };
	expect((await page.request.get(`/api/responses/${id}`, { headers })).status()).toBe(200);

	await page.getByRole("button", { name: "Your answers and this device" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: "Delete my answers" }).click();
	// It asks once more before it does it.
	await expect(dialog.getByText("This cannot be undone.")).toBeVisible();
	await dialog.getByRole("button", { name: "Yes, delete them" }).click();

	await expect(page.getByRole("heading", { name: "Your answers were deleted" })).toBeVisible();
	expect((await page.request.get(`/api/responses/${id}`, { headers })).status()).toBe(404);

	// And the form's link no longer offers them.
	await open(page);
	await expect(page.getByText("You started this form on this device")).toHaveCount(0);
});

test("forgets a response on this device, and leaves it where it is stored", async ({ page }) => {
	await start(page);
	const url = new URL(page.url());
	const id = url.pathname.split("/").pop() ?? "";
	const headers = { Authorization: `Bearer ${url.hash.slice(1)}` };

	await open(page);
	await expect(page.getByText("You started this form on this device")).toBeVisible();
	await page.getByRole("button", { name: "Forget it on this device" }).click();
	await expect(page.getByText("You started this form on this device")).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
	await expect(page.getByText("You started this form on this device")).toHaveCount(0);

	// The answers are still there for whoever has the address.
	expect((await page.request.get(`/api/responses/${id}`, { headers })).status()).toBe(200);
});

test("forgets from inside the form too, and goes back to its first page", async ({ page }) => {
	await start(page);
	await page.getByRole("button", { name: "Your answers and this device" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Forget on this device" }).click();
	await expect(page).toHaveURL(new RegExp(`${FORM}$`));
	await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
	await expect(page.getByText("You started this form on this device")).toHaveCount(0);
});

test("gives the consent text on a page of its own, to print or keep", async ({ page }) => {
	await open(page);
	const link = page.getByRole("link", { name: "Open this text on its own, to print or keep" });
	await expect(link).toHaveAttribute("href", `${FORM}/consent`);
	await page.goto(`${FORM}/consent`);
	await expect(heading(page, "Before you start")).toBeVisible();
	await expect(page.getByText(CONSENT)).toBeVisible();
	await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled();
	// On paper there are no buttons.
	await page.emulateMedia({ media: "print" });
	await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
	await expect(page.getByText(CONSENT)).toBeVisible();
});

test("says so calmly when the form was closed before the address for the results was sent", async ({
	page,
}) => {
	await start(page);
	await skipTo(page, "Thank you");
	// As the server answers once the form's owner has closed it: the same as for no form.
	await page.route("**/api/forms/*/detached", (route) =>
		route.fulfill({
			status: 404,
			contentType: "application/json",
			body: JSON.stringify({ error: "There is no such form." }),
		}),
	);
	await page.getByRole("textbox").fill("reader@example.test");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByRole("status")).toHaveText(
		"This form has closed in the meantime, so this was not stored.",
	);
	// Nothing to try again, and nothing that reads as a fault.
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
	await expect(heading(page, "Thank you")).toBeVisible();
});
