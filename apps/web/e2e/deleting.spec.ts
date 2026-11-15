import { plantForm } from "../test/made-up";
import { expect, test } from "./fixtures";
import { bringIn, freshId, respond, signUp } from "./owner";

test("cannot open a form that does not say who runs it, until that is filled in", async ({
	page,
	browser,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	// As an import leaves a form: without the line that says who runs it.
	const { controller: _controller, ...unsigned } = plantForm(id);
	await page.getByRole("link", { name: "New form" }).click();
	await page.getByLabel("Or paste it").fill(JSON.stringify(unsigned));
	await page.getByRole("button", { name: "Check it" }).click();
	const outline = page.getByRole("region", { name: "What it becomes" });
	await expect(outline).toContainText("It does not say who runs it.");
	await outline.getByRole("button", { name: "Bring it in as a draft" }).click();
	await expect(page).toHaveURL(new RegExp(`/forms/${id}/settings$`));

	await expect(
		page.getByText("Missing: this form does not say who runs it yet.", { exact: false }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Open it for answers" })).toBeDisabled();

	await page.getByLabel("Name of the person or organisation").fill("Made-up Fern Society");
	await page.getByLabel(/^How to reach them/).fill("ferns@example.org");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Saved. New responses start under this version.")).toBeVisible();
	await expect(page.getByText("Missing: this form does not say", { exact: false })).toHaveCount(0);

	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto(`/f/${id}`);
	await expect(visitor.getByRole("region", { name: "About this form" })).toContainText(
		"Run by Made-up Fern Society",
	);
});

test("deletes a form with everything in it, once its id is typed", async ({
	page,
	browser,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	await bringIn(page, id);
	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();
	await respond(browser, id, "A lot", { finish: true });
	await respond(browser, id, "Some", { finish: false });
	await page.reload();

	await page.getByRole("button", { name: "Delete this form" }).click();
	const dialog = page.getByRole("dialog");
	// In numbers, before anything is removed.
	await expect(dialog).toContainText("It holds 2 responses with");
	await expect(dialog).toContainText("and 1 version of its definition.");
	const confirm = dialog.getByRole("button", { name: "Delete the form" });
	await expect(confirm).toBeDisabled();
	await dialog.getByRole("textbox").fill(`${id}-not`);
	await expect(confirm).toBeDisabled();
	await dialog.getByRole("textbox").fill(id);
	await confirm.click();

	await expect(page).toHaveURL(/\/forms$/);
	await expect(page.getByRole("heading", { level: 1, name: "Your forms" })).toBeVisible();
	await expect(page.getByRole("link", { name: /Plants at home/ })).toHaveCount(0);
	// Its pages and its link are gone.
	expect((await page.goto(`/forms/${id}/settings`))?.status()).toBe(404);
	expect((await page.goto(`/f/${id}`))?.status()).toBe(404);
});

test("deletes an account only once it has no forms, and says so before", async ({ page }, info) => {
	const id = freshId(info);
	await signUp(page);
	const email = (await page.getByRole("link", { name: /@example\.test$/ }).textContent()) ?? "";
	await bringIn(page, id);

	await page.goto("/account");
	await expect(page.getByRole("button", { name: "Change password" })).toBeEnabled();
	await expect(
		page.getByText("You have 1 form. Delete it first, under its Settings", { exact: false }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);

	// The form goes first.
	await page.goto(`/forms/${id}/settings`);
	await page.getByRole("button", { name: "Delete this form" }).click();
	await page.getByRole("dialog").getByRole("textbox").fill(id);
	await page.getByRole("dialog").getByRole("button", { name: "Delete the form" }).click();
	await expect(page).toHaveURL(/\/forms$/);

	await page.goto("/account");
	await page.getByRole("button", { name: "Delete my account" }).click();
	const dialog = page.getByRole("dialog");
	const confirm = dialog.getByRole("button", { name: "Delete the account" });
	await expect(confirm).toBeDisabled();
	// The account's password, not its address: a wrong one is refused, and says so.
	await dialog.getByLabel("Your current password, to confirm").fill("not-the-password");
	await confirm.click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"The password is not right, so the account was not deleted.",
	);
	await dialog.getByLabel("Your current password, to confirm").fill("correct-horse-battery");
	await confirm.click();

	// Signed out, and the account is gone: its address and password open nothing.
	await expect(page).toHaveURL(/\/login/);
	await page.goto("/forms");
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("alert")).toHaveText("The email or the password is not right.");
});
