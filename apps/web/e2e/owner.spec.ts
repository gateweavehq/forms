import { readFile } from "node:fs/promises";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { bakingForm } from "../../../packages/tally-import/test/baking-form";
import { plantForm } from "../test/made-up";
import { expect, test } from "./fixtures";
import { choose, forward, heading, skipTo } from "./helpers";

/** An id no other test or project uses: they share one server and one database. */
function freshId(info: TestInfo): string {
	return `plants-${info.project.name}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Makes an account and lands on its list of forms. */
async function signUp(page: Page): Promise<void> {
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
function tab(page: Page, name: string): Locator {
	return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

/** Brings the made-up plant form in from its definition and opens it for answers. */
async function bringIn(page: Page, id: string): Promise<void> {
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
async function respond(
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
	await context.close();
}

test("brings a form in, watches its answers arrive, filters, exports, deletes and closes", async ({
	page,
	browser,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	await bringIn(page, id);

	// A draft is not answerable: its link says so to anyone else.
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto(`/f/${id}`);
	await expect(visitor.getByRole("heading", { name: "This form is not open yet" })).toBeVisible();

	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();

	// Nothing yet.
	await tab(page, "Overview").click();
	await expect(page.getByText("No responses yet.")).toBeVisible();

	// One person finishes, another stops after the first question.
	await respond(browser, id, "A lot", { finish: true });
	await page.reload();
	await expect(page.getByTestId("started")).toHaveText("1");
	await expect(page.getByTestId("completed")).toHaveText("1");

	await respond(browser, id, "Very little", { finish: false });
	await page.reload();
	await expect(page.getByTestId("started")).toHaveText("2");
	await expect(page.getByTestId("completed")).toHaveText("1");
	await expect(page.getByTestId("counted")).toHaveText("Counting all 2 responses to this version.");

	// Each option out of those who answered.
	await tab(page, "Questions").click();
	const light = page.locator('[data-question="light"]');
	await expect(light.locator('[data-option="bright"]')).toContainText("1 (50%)");
	await expect(light.locator('[data-option="dim"]')).toContainText("1 (50%)");
	await expect(light.locator('[data-option="some"]')).toContainText("0 (0%)");

	// The filter narrows what is counted, says so, and is kept from tab to tab.
	await page.getByLabel("Answer").selectOption({ label: "A lot" });
	await expect(page.getByTestId("counted")).toHaveText(
		"Counting 1 of the 2 responses to this version.",
	);
	await expect(light.locator('[data-option="bright"]')).toContainText("1 (100%)");
	await tab(page, "Overview").click();
	await expect(page.getByTestId("started")).toHaveText("1");
	await page.getByRole("button", { name: "Clear the filter" }).click();
	await expect(page.getByTestId("started")).toHaveText("2");

	// The items, each with its statuses, at whatever width this is.
	await tab(page, "Items").click();
	await expect(page.getByText("Monstera", { exact: true }).filter({ visible: true })).toHaveCount(
		1,
	);

	// The export holds what was answered, one row each.
	await tab(page, "Overview").click();
	const [download] = await Promise.all([
		page.waitForEvent("download"),
		page.getByRole("link", { name: "Responses (CSV)" }).click(),
	]);
	expect(download.suggestedFilename()).toMatch(new RegExp(`^${id}-responses-[0-9a-f]{8}\\.csv$`));
	const lines = (await readFile(await download.path(), "utf8")).split("\r\n");
	expect(lines[0]).toContain("response,device,started,completed,active_seconds,light,count,");
	expect(lines).toHaveLength(4);
	expect(lines.filter((line) => line.includes(",bright,"))).toHaveLength(1);
	expect(lines.filter((line) => line.includes(",dim,"))).toHaveLength(1);

	// One response, opened and deleted.
	await tab(page, "Responses").click();
	await expect(page.locator("[data-response]")).toHaveCount(2);
	await page.locator("[data-response]").filter({ hasText: "Not completed" }).click();
	await expect(page.getByText("Very little")).toBeVisible();
	await page.getByRole("button", { name: "Delete this response" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Delete this response" }).click();
	await expect(page).toHaveURL(new RegExp(`/forms/${id}/responses$`));
	await expect(page.locator("[data-response]")).toHaveCount(1);

	// Closed: its link says so, and nobody can start.
	await tab(page, "Settings").click();
	await page.getByRole("button", { name: "Close it" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Close it" }).click();
	await expect(page.getByText("This form is closed.", { exact: false }).first()).toBeVisible();
	await visitor.goto(`/f/${id}`);
	await expect(visitor.getByRole("status")).toHaveText(
		"This form is closed and takes no new answers. Thank you for coming.",
	);
	await expect(visitor.getByRole("button", { name: "Start" })).toBeHidden();
});

test("brings a form in from a Tally form's page, and says what was folded", async ({
	page,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	await page.getByRole("link", { name: "New form" }).click();
	await page.getByLabel("A Tally form's page").check();
	await page.getByLabel("Upload a file").setInputFiles({
		name: "made-up-baking.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(bakingForm())),
	});
	await page.getByLabel(/^Address/).fill(id);
	await page.getByRole("button", { name: "Check it" }).click();
	const outline = page.getByRole("region", { name: "What it becomes" });
	await expect(outline).toContainText(`Its address will be /f/${id}`);
	await expect(outline).toContainText("were folded into one section");
	await outline.getByRole("button", { name: "Bring it in as a draft" }).click();
	await expect(page).toHaveURL(new RegExp(`/forms/${id}/settings$`));
	await expect(page.getByRole("link", { name: `/f/${id}` })).toBeVisible();
});

test("shows a form's results to nobody but its owner", async ({ page, browser }, info) => {
	const id = freshId(info);
	await signUp(page);
	await bringIn(page, id);

	// Another account, and nobody at all, get what a missing form gets.
	const other = await (await browser.newContext()).newPage();
	await signUp(other);
	for (const visitor of [other, await (await browser.newContext()).newPage()]) {
		for (const path of ["", "/responses", "/settings"]) {
			const response = await visitor.goto(`/forms/${id}${path}`);
			expect(response?.status()).toBe(404);
			await expect(visitor.getByRole("heading", { name: "There is no such form" })).toBeVisible();
		}
		const exported = await visitor.request.get(`/api/owner/forms/${id}/export/responses.csv`);
		expect(exported.status()).toBe(404);
	}
	await expect(other.getByText("Plants at home")).toHaveCount(0);
});

test("answers the pages' own server functions to nobody but the owner", async ({
	page,
	browser,
}, info) => {
	const id = freshId(info);
	await signUp(page);
	await bringIn(page, id);
	await page.getByRole("button", { name: "Open it for answers" }).click();
	await expect(page.getByText("This form is open.")).toBeVisible();
	await respond(browser, id, "A lot", { finish: true });

	// What the pages load, they load from addresses of their own. Each one the owner's
	// browser asks while going through the tabs is kept, to be asked again by others.
	const asked = new Map<string, Record<string, string>>();
	page.on("request", (request) => {
		if (request.method() !== "GET" || !request.url().includes("/_serverFn/")) return;
		const { cookie: _cookie, ...headers } = request.headers();
		asked.set(request.url(), headers);
	});
	await page.goto("/forms");
	await page.getByRole("link", { name: /Plants at home/ }).click();
	await expect(page.getByTestId("started")).toHaveText("1");
	for (const name of ["Items", "Questions", "Responses"]) {
		await tab(page, name).click();
		await expect(page.getByTestId("counted")).toBeVisible();
	}
	await page.locator("[data-response]").first().click();
	await expect(page.getByRole("button", { name: "Delete this response" })).toBeVisible();
	await tab(page, "Kept apart").click();
	await expect(page.getByRole("status")).toBeVisible();
	await tab(page, "Settings").click();
	await expect(page.getByText("This form is open.")).toBeVisible();

	const mine = [...asked].filter(([url]) => decodeURIComponent(url).includes(id));
	// The form itself, four views of its results, one response, and what is kept apart.
	expect(mine.length).toBeGreaterThanOrEqual(7);

	const other = await browser.newContext();
	await signUp(await other.newPage());
	const nobody = await browser.newContext();
	for (const [url, headers] of mine) {
		const own = await page.request.get(url, { headers });
		expect(own.status()).toBe(200);
		const ownText = await own.text();

		// The same question about a form that does not exist, as the measure.
		const missing = await page.request.get(url.replaceAll(id, "no-such-form"), { headers });
		const expected = await missing.text();
		expect(expected).not.toBe(ownText);

		for (const context of [other, nobody]) {
			const response = await context.request.get(url, { headers });
			expect(response.status()).toBe(missing.status());
			const text = await response.text();
			expect(text).toBe(expected);
			expect(text).not.toContain("Plants at home");
			expect(text).not.toContain("A lot");
		}
	}
});
