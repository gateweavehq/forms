import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { choose, FORM, forward, heading, open, skipTo, start } from "./helpers";
import { bringIn, freshId, signUp } from "./owner";

/** The response a page is on, as the server answers for it. */
async function status(page: Page, address = page.url()): Promise<number> {
	const url = new URL(address);
	const id = url.pathname.split("/").pop() ?? "";
	const response = await page.request.get(`/api/responses/${id}`, {
		headers: { Authorization: `Bearer ${url.hash.slice(1)}` },
	});
	return response.status();
}

const takeBack = (page: Page) => page.getByRole("button", { name: "Take my answers back" });

test("says before starting who runs the form, until when answers can be taken back, and what is stored", async ({
	page,
}) => {
	await open(page);
	const about = page.getByRole("region", { name: "About this form" });
	await expect(about).toContainText("Run by Made-up Bread Study, Example Institute");
	await expect(about.getByRole("link", { name: "bread-study@example.org" })).toHaveAttribute(
		"href",
		"mailto:bread-study@example.org",
	);
	await expect(about).toContainText(
		"You can take your answers back yourself at any time, also after you finish, for as long as this form is open.",
	);
	const link = about.getByRole("link", { name: "What is stored about you" });
	await expect(link).toHaveAttribute("href", `${FORM}/stored`);

	await page.goto(`${FORM}/stored`);
	await expect(heading(page, "What is stored")).toBeVisible();
	await expect(page.getByText("Your network (IP) address.", { exact: false })).toBeVisible();
	await expect(page.getByText("When you finished.")).toBeVisible();
	await expect(
		page.getByText("How long the question was on your screen while the page was visible."),
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "Kept apart from your answers" })).toBeVisible();
	await expect(page.getByText("history for up to 30 days", { exact: false })).toBeVisible();
	await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled();
});

test("takes a finished response back from the end page, after asking once more", async ({
	page,
}) => {
	await start(page);
	await skipTo(page, "Thank you");
	const address = page.url();
	expect(await status(page, address)).toBe(200);
	await expect(
		page.getByText("You can take your answers back for as long as this form is open.", {
			exact: false,
		}),
	).toBeVisible();

	// One press does nothing yet: it says what goes and what stays, and can be backed out of.
	await takeBack(page).click();
	await expect(
		page.getByText(
			"This deletes your response, every answer in it and the times that go with them.",
		),
	).toBeVisible();
	// The baking form keeps an address apart, which cannot be found from a response.
	await expect(
		page.getByText("Anything you entered to be kept apart", { exact: false }),
	).toContainText("stays");
	expect(await status(page, address)).toBe(200);
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByRole("button", { name: "Yes, delete my answers" })).toHaveCount(0);
	expect(await status(page, address)).toBe(200);

	await takeBack(page).click();
	await page.getByRole("button", { name: "Yes, delete my answers" }).click();
	await expect(page.getByRole("heading", { name: "Your answers were deleted" })).toBeVisible();
	await expect(page.getByText("is still stored", { exact: false })).toBeVisible();
	expect(await status(page, address)).toBe(404);

	// The address opens nothing any more.
	await page.reload();
	await expect(page.getByRole("heading", { name: "These answers cannot be found" })).toBeVisible();
});

test("lets a second device with the address take the answers back, and tells the first", async ({
	page,
	browser,
}) => {
	await start(page);
	await skipTo(page, "Thank you");
	const address = page.url();

	const other = await (await browser.newContext()).newPage();
	await other.goto(address);
	await expect(heading(other, "Thank you")).toBeVisible();
	await takeBack(other).click();
	await other.getByRole("button", { name: "Yes, delete my answers" }).click();
	await expect(other.getByRole("heading", { name: "Your answers were deleted" })).toBeVisible();
	expect(await status(page, address)).toBe(404);

	// The first device still shows the button. Pressing it finds nothing left, and says so.
	await takeBack(page).click();
	await page.getByRole("button", { name: "Yes, delete my answers" }).click();
	await expect(
		page.getByText("Your answers could not be taken back from here", { exact: false }),
	).toBeVisible();
	await expect(takeBack(page)).toHaveCount(0);
});

test("offers nothing to press on a form that lets go of nothing after the end, and says whom to ask", async ({
	page,
}) => {
	await page.goto("/f/quick-feedback");
	await expect(
		page.getByText("You can take your answers back yourself until you finish.", { exact: false }),
	).toBeVisible();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "Your view")).toBeVisible();
	await forward(page);
	await choose(page, "Yes");
	await forward(page);
	await expect(heading(page, "Thank you")).toBeVisible();
	await expect(
		page.getByText("Your answers are part of the study now and cannot be taken back from here.", {
			exact: false,
		}),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "page-team@example.org" })).toBeVisible();
	await expect(takeBack(page)).toHaveCount(0);
	expect(await status(page)).toBe(200);
});

test("ends with the form: once it is closed, a finished response stays, and the page says whom to ask", async ({
	page,
	browser,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	await bringIn(page, id);
	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();

	// Someone finishes, and leaves the page open with its button on it.
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto(`/f/${id}`);
	await expect(visitor.getByRole("button", { name: "Start" })).toBeEnabled();
	await visitor.getByRole("button", { name: "Start" }).click();
	await expect(heading(visitor, "Your home")).toBeVisible();
	await skipTo(visitor, "Thank you");
	await expect(takeBack(visitor)).toBeVisible();
	const address = visitor.url();

	await page.getByRole("button", { name: "Close it" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Close it" }).click();
	await expect(page.getByText("This form is closed.", { exact: false }).first()).toBeVisible();

	// The button the page still shows is refused by the server, and the page says so.
	await takeBack(visitor).click();
	await visitor.getByRole("button", { name: "Yes, delete my answers" }).click();
	await expect(
		visitor.getByText("Your answers could not be taken back from here", { exact: false }),
	).toBeVisible();
	expect(await status(visitor, address)).toBe(200);

	// Opened again, the address shows the answers, no button, and whom to ask.
	await visitor.reload();
	await expect(heading(visitor, "Thank you")).toBeVisible();
	await expect(
		visitor.getByText("This form has closed, so answers can no longer be taken back from here.", {
			exact: false,
		}),
	).toBeVisible();
	await expect(visitor.getByRole("link", { name: "plant-study@example.org" })).toBeVisible();
	await expect(takeBack(visitor)).toHaveCount(0);

	// Its owner is shown that nobody withdrew, by nothing being said.
	await expect(page.locator("[data-withdrawn]")).toHaveCount(0);
});

test("shows the owner how many took their answers back, and not which", async ({
	page,
	browser,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	await bringIn(page, id);
	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();

	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto(`/f/${id}`);
	await expect(visitor.getByRole("button", { name: "Start" })).toBeEnabled();
	await visitor.getByRole("button", { name: "Start" }).click();
	await expect(heading(visitor, "Your home")).toBeVisible();
	await skipTo(visitor, "Thank you");
	const responseId = new URL(visitor.url()).pathname.split("/").pop() ?? "";
	await takeBack(visitor).click();
	await visitor.getByRole("button", { name: "Yes, delete my answers" }).click();
	await expect(visitor.getByRole("heading", { name: "Your answers were deleted" })).toBeVisible();

	await page.reload();
	await expect(page.locator("[data-withdrawn]")).toHaveText(
		"· 1 taken back by the person who gave it",
	);
	await expect(page.getByText("0 started, 0 completed", { exact: false })).toBeVisible();
	await expect(page.locator("body")).not.toContainText(responseId);
});
