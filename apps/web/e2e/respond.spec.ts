import { expect, test } from "./fixtures";
import {
	autoAdvanceSwitch,
	back,
	CONSENT,
	choose,
	closeOptions,
	expectNoProgressDisplay,
	FORM,
	forward,
	heading,
	open,
	openOptions,
	setAutoAdvance,
	skipTo,
	start,
	stored,
	tabTo,
} from "./helpers";

const STOPPED = "Used to make it, but stopped";

test("asks for consent before any question, and starts nothing until it is given", async ({
	page,
}) => {
	const started: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "POST") started.push(request.url());
	});
	await open(page);
	await expect(page.getByRole("heading", { level: 1, name: "Bread at home" })).toBeVisible();
	await expect(page.getByText("Your answers are saved as you give them")).toBeVisible();
	// The consent is the whole page: no question of the form is on it.
	await expect(page.getByText("How often do you bake bread?")).toHaveCount(0);

	await page.getByRole("button", { name: "Start" }).click();
	await expect(page.getByRole("alert")).toHaveText("Tick the box to take part.");
	await expect(page.getByLabel(CONSENT)).toBeFocused();
	expect(started).toEqual([]);
	expect(new URL(page.url()).pathname).toBe(FORM);

	await page.getByLabel(CONSENT).check();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "You and your kitchen")).toBeVisible();
	// The response's id is in the path and its secret after the #, where no server sees it.
	expect(page.url()).toMatch(/\/f\/home-baking\/r\/[\w-]{16}#[\w-]{43}$/);
	expect(started).toHaveLength(1);
});

test("asks a leg of questions one to a card, and opens a question when its rule holds", async ({
	page,
}) => {
	await start(page);
	await expect(page.getByText("Part 1 of 3", { exact: true })).toBeVisible();
	await forward(page);

	await expect(heading(page, "How often do you bake bread?")).toBeVisible();
	await expect(page.getByText("Part 1 of 3 · You and your kitchen")).toBeVisible();
	await choose(page, "About once a month");
	await forward(page);

	// A number that is not one is said so, in words, and the card stays.
	await page.getByRole("textbox").fill("a few");
	await forward(page);
	await expect(page.getByRole("alert")).toHaveText("Enter a number, or leave it empty.");
	await page.getByRole("textbox").fill("3,5");
	await forward(page);

	// "Choose up to two": a third cannot be ticked, and the card says why.
	await choose(page, "It tastes better");
	await choose(page, "It costs less");
	await expect(page.getByText("That is 2. Untick one to pick another.")).toBeVisible();
	await choose(page, "I enjoy the work", { blocked: true });
	await expect(page.getByRole("checkbox", { name: "I enjoy the work" })).not.toBeChecked();
	await choose(page, "It costs less");
	await choose(page, "Something else");
	await page.getByRole("textbox", { name: "Something else: Please specify" }).fill("The smell");
	await forward(page);

	await page.getByRole("combobox").selectOption({ label: "Gas oven" });
	await forward(page);

	// The starter's age is asked only of someone who keeps one.
	await choose(page, "No");
	await forward(page);
	await expect(heading(page, "How often do you use each of these?")).toBeVisible();
	await back(page);
	await choose(page, "Yes");
	await forward(page);
	await expect(heading(page, "How old is your starter, in years?")).toBeVisible();
	await page.getByRole("textbox").fill("2");
	await forward(page);

	await page.getByRole("group", { name: "Kitchen scale" }).getByText("Every bake").click();
	await page.getByRole("group", { name: "Thermometer" }).getByText("Never").click();
	await forward(page);

	await page.getByLabel("Wheat").fill("Strong white");
	await forward(page);

	// A ranking is picked in order. Nothing is dragged.
	await page.getByRole("button", { name: "The flavour" }).click();
	await page.getByRole("button", { name: "The crust" }).click();
	await expect(page.getByRole("button", { name: "The flavour" })).toHaveAccessibleName(
		"The flavour, ranked 1",
	);
	await expect(page.getByRole("button", { name: "The crumb" })).toHaveAccessibleName(
		"The crumb, not ranked",
	);
	await forward(page);
	await expect(heading(page, "Nine breads")).toBeVisible();

	await expect
		.poll(async () => (await stored(page)).answers.questions)
		.toMatchObject({
			often: { value: { option: "monthly" } },
			years: { value: 3.5 },
			reasons: { value: { options: ["taste", "other"], texts: { other: "The smell" } } },
			oven: { value: { option: "gas" } },
			starter: { value: { option: "yes" }, changes: 1 },
			"starter-age": { value: 2 },
			tools: { value: { rows: { scale: "always", thermometer: "never" } } },
			flours: { value: { fields: { wheat: "Strong white" } } },
			priorities: { value: { order: ["flavour", "crust"] } },
		});
});

test("asks every item of a group first, then the follow-ups of the items that have any", async ({
	page,
}) => {
	await start(page);
	await skipTo(page, "Nine breads");
	await expect(page.getByText("9 items in 3 groups, one tap each")).toBeVisible();
	await forward(page);

	// One item to a card: its label, its definition, and all the answers at once.
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	await expect(page.getByText("Group 1 of 3: Loaves · 1 of 4")).toBeVisible();
	await expect(page.getByText("A soft, even loaf baked in a tin, made for slicing.")).toBeVisible();
	await expect(page.getByText("Have you made sandwich loaves?")).toBeVisible();
	await expect(page.getByRole("radio")).toHaveCount(5);
	// The longer text is there for whoever wants it, and closed until then.
	await expect(page.getByText("It rises twice, the second time in the tin")).toBeHidden();
	await page.getByText("More about it").click();
	await expect(page.getByText("It rises twice, the second time in the tin")).toBeVisible();

	// A tap answers and moves on. Choosing "stopped" opens nothing here: the follow-ups wait.
	await choose(page, "Make it most weeks");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await choose(page, STOPPED);
	await expect(heading(page, "Rye bread")).toBeVisible();
	await choose(page, STOPPED);
	await expect(heading(page, "Brioche")).toBeVisible();
	await expect(page.getByText("Group 1 of 3: Loaves · 4 of 4")).toBeVisible();
	await choose(page, "Never made it");

	// After the group's last item comes the look back, and only then anything about "stopped".
	await expect(heading(page, "Your answers: Loaves")).toBeVisible();
	await forward(page);
	// Then the follow-ups are introduced: how many, and which.
	await expect(
		heading(page, "You stopped making 2 of these. A few questions about each."),
	).toBeVisible();
	await expect(page.getByRole("listitem")).toHaveText(["Sourdough loaf", "Rye bread"]);
	await forward(page);

	// Sourdough: "Another reason" opens the question that asks which.
	await expect(
		heading(page, "Why did you stop making sourdough loaves? Choose all that fit."),
	).toBeVisible();
	await expect(page.getByText("Group 1 of 3: Loaves · Follow-up questions, 1 of 2")).toBeVisible();
	await choose(page, "It took too long");
	await choose(page, "Another reason");
	await forward(page);
	await expect(heading(page, "What was the other reason?")).toBeVisible();
	await page.getByRole("textbox").fill("My starter died");
	await forward(page);
	await expect(heading(page, "Would you make sourdough loaves again?")).toBeVisible();
	// A follow-up does not move on by itself: only the one-tap item cards do.
	await choose(page, "Only with a better recipe");
	await expect(heading(page, "Would you make sourdough loaves again?")).toBeVisible();
	await forward(page);
	await expect(
		heading(page, "What would a better recipe for sourdough loaves have to fix?"),
	).toBeVisible();
	await page.getByRole("textbox").fill("The timing");
	await forward(page);

	// Rye: neither rule inside the chain holds, so neither of those questions is asked.
	await expect(
		heading(page, "Why did you stop making rye bread? Choose all that fit."),
	).toBeVisible();
	await expect(page.getByText("Follow-up questions, 2 of 2")).toBeVisible();
	await choose(page, "Nobody at home ate it");
	await forward(page);
	await expect(heading(page, "Would you make rye bread again?")).toBeVisible();
	await choose(page, "No");
	await forward(page);

	// The next group opens with its name and its size.
	await expect(heading(page, "Flatbreads")).toBeVisible();
	await expect(page.getByText("3 items, one tap each")).toBeVisible();
	await forward(page);

	// Nobody stopped making a flatbread: the group has no follow-ups at all.
	await expect(heading(page, "Pita")).toBeVisible();
	await expect(page.getByText("Group 2 of 3: Flatbreads · 1 of 3")).toBeVisible();
	await choose(page, "Made it once or twice");
	await expect(heading(page, "Naan")).toBeVisible();
	await choose(page, "Made it once or twice");
	await expect(heading(page, "Flour tortillas")).toBeVisible();
	await choose(page, "Made it once or twice");
	await expect(heading(page, "Your answers: Flatbreads")).toBeVisible();
	await forward(page);
	await expect(heading(page, "Small bakes")).toBeVisible();
	await forward(page);

	await expect(heading(page, "Bagels")).toBeVisible();
	await choose(page, STOPPED);
	await expect(heading(page, "Soft pretzels")).toBeVisible();
	await choose(page, "Never made it");
	await expect(heading(page, "Your answers: Small bakes")).toBeVisible();
	await forward(page);
	await expect(
		heading(page, "You stopped making 1 of these. A few questions about each."),
	).toBeVisible();
	await skipTo(page, "Last things");

	await expect
		.poll(async () => (await stored(page)).answers.items)
		.toMatchObject({
			"sandwich-loaf": { made: { value: { option: "often" } } },
			"sourdough-loaf": {
				made: { value: { option: "stopped" } },
				"stopped-why": { value: { options: ["time", "other"] } },
				"stopped-why-other": { value: "My starter died" },
				again: { value: { option: "recipe" } },
				"recipe-fix": { value: "The timing" },
			},
			"rye-bread": {
				made: { value: { option: "stopped" } },
				"stopped-why": { value: { options: ["eaters"] } },
				again: { value: { option: "no" } },
			},
			pita: { made: { value: { option: "once" } } },
			bagels: {
				made: { value: { option: "stopped" } },
				// Shown and passed without an answer: stored as seen, with no value.
				"stopped-why": { value: null },
				again: { value: null },
			},
			"soft-pretzels": { made: { value: { option: "never" } } },
		});
	const { items } = (await stored(page)).answers;
	expect(items["rye-bread"]).not.toHaveProperty("stopped-why-other");
	expect(items["rye-bread"]).not.toHaveProperty("recipe-fix");
	expect(items.pita).not.toHaveProperty("stopped-why");
});

test("lets Back change an answer, and counts the change", async ({ page }) => {
	await start(page);
	await skipTo(page, "Nine breads");
	await forward(page);
	await choose(page, "Never made it");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();

	// Back is one press, and the card comes back with its answer still chosen.
	await back(page);
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	await expect(page.getByRole("radio", { name: "Never made it" })).toBeChecked();
	await choose(page, "Make it now and then");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await expect
		.poll(async () => (await stored(page)).answers.items["sandwich-loaf"]?.made)
		.toMatchObject({ value: { option: "sometimes" }, changes: 1 });

	// Tapping the answer already chosen confirms it and moves on, and is not a change.
	await back(page);
	await expect(page.getByRole("radio", { name: "Make it now and then" })).toBeChecked();
	await choose(page, "Make it now and then");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await choose(page, STOPPED);
	await expect(heading(page, "Rye bread")).toBeVisible();
	await expect.poll(async () => (await stored(page)).position).toBe("i:rye-bread:made");
	const answer = (await stored(page)).answers.items["sandwich-loaf"]?.made;
	expect(answer).toMatchObject({ value: { option: "sometimes" }, changes: 1 });
	// Time was measured, and it is the time of a few taps, not of the whole test.
	expect(answer?.activeMs).toBeGreaterThan(0);
	expect(answer?.activeMs).toBeLessThan(60_000);
});

test("resumes in another browser from the address alone", async ({ page, browser }) => {
	await start(page);
	await skipTo(page, "Nine breads");
	await forward(page);
	await choose(page, "Make it most weeks");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await choose(page, STOPPED);
	await expect(heading(page, "Rye bread")).toBeVisible();
	await expect.poll(async () => (await stored(page)).position).toBe("i:rye-bread:made");
	const address = page.url();

	// Another browser: no storage and no cookies in common. The address is all it has.
	const elsewhere = await browser.newContext();
	const second = await elsewhere.newPage();
	await second.goto(address);
	await expect(heading(second, "Rye bread")).toBeVisible();
	await expect(second.getByText("Group 1 of 3: Loaves · 3 of 4")).toBeVisible();
	await back(second);
	await expect(heading(second, "Sourdough loaf")).toBeVisible();
	await expect(second.getByRole("radio", { name: STOPPED })).toBeChecked();

	// What is answered there is the same response, seen from the first browser too.
	await forward(second);
	await second.getByText("Never made it").click();
	await expect(heading(second, "Brioche")).toBeVisible();
	await expect
		.poll(async () => (await stored(page)).answers.items["rye-bread"]?.made?.value)
		.toEqual({ option: "never" });
	await elsewhere.close();
});

test("refuses an address without its secret, and one with a wrong secret", async ({
	page,
	browser,
}) => {
	await start(page);
	const address = new URL(page.url());
	const elsewhere = await browser.newContext();
	const second = await elsewhere.newPage();

	await second.goto(`${address.origin}${address.pathname}`);
	await expect(second.getByRole("heading", { name: "This link is incomplete" })).toBeVisible();

	await second.goto(`${address.origin}${address.pathname}#not-the-secret`);
	await second.reload();
	await expect(
		second.getByRole("heading", { name: "These answers cannot be found" }),
	).toBeVisible();
	await expect(heading(second, "You and your kitchen")).toHaveCount(0);
	await elsewhere.close();
});

test("offers to continue from the form's bare link on the same device", async ({ page }) => {
	await start(page);
	await forward(page);
	await choose(page, "Most weeks");
	await forward(page);
	await expect(heading(page, "For how many years have you baked bread at home?")).toBeVisible();
	await expect.poll(async () => (await stored(page)).position).toBe("q:years");

	await page.goto(FORM);
	await page.getByRole("button", { name: "Continue where you stopped" }).click();
	await expect(heading(page, "For how many years have you baked bread at home?")).toBeVisible();
});

test("shows the address that continues on another device", async ({ page }) => {
	await start(page);
	// It is in the menu, not on the card.
	await expect(page.getByRole("button", { name: "Continue on another device" })).toBeHidden();
	await openOptions(page);
	await page.getByRole("button", { name: "Continue on another device" }).click();
	const dialog = page.getByRole("dialog", { name: "Continue on another device" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("textbox")).toHaveValue(page.url());
	await dialog.getByRole("button", { name: "Close" }).click();
	await expect(dialog).toBeHidden();
	// The focus is back on what opened it, and the menu is closed behind it.
	await expect(page.getByRole("button", { name: "Options" })).toBeFocused();
	await expect(page.getByRole("button", { name: "Options" })).toHaveAttribute(
		"aria-expanded",
		"false",
	);
});

test("keeps the detached answer apart from the response", async ({ page }) => {
	await start(page);
	await skipTo(page, "Is there anything about baking at home that this survey should have asked?");
	// The email is a question of this leg in the definition, and is not asked in it.
	await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
	await page.getByRole("textbox").fill("More flatbreads, please.");
	await forward(page);

	await expect(heading(page, "Thank you")).toBeVisible();
	await expect(
		page.getByText("What you enter here is stored apart from your answers"),
	).toBeVisible();
	// Its own rule still holds: the second question waits for an address.
	await expect(page.getByText("May we write to you about a follow-up survey?")).toHaveCount(0);
	await page.getByRole("textbox").fill("not an address");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByRole("alert")).toHaveText("Enter an email address, or leave it empty.");

	const sent: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "POST") sent.push(`${request.url()} ${request.postData()}`);
	});
	await page.getByRole("textbox").fill("reader@example.test");
	await choose(page, "Yes");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText("Sent. Thank you.")).toBeVisible();

	// The request that carried the address names the form and nothing of the response.
	const address = new URL(page.url());
	const responseId = address.pathname.split("/").pop() ?? "";
	expect(sent).toHaveLength(1);
	expect(sent[0]).toContain("/api/forms/home-baking/detached");
	expect(sent[0]).not.toContain(responseId);
	expect(sent[0]).not.toContain(address.hash.slice(1));

	// And the response, read back, holds no trace of it.
	const response = await stored(page);
	expect(response.completed).toBe(true);
	expect(response.answers.questions.comments?.value).toBe("More flatbreads, please.");
	expect(Object.keys(response.answers.questions)).not.toContain("email");
	expect(Object.keys(response.answers.questions)).not.toContain("contact");
	expect(JSON.stringify(response)).not.toContain("reader@example.test");

	// Nor can it be put there: the response's own address refuses a detached question.
	const refused = await page.request.post(`/api/responses/${responseId}/progress`, {
		headers: { Authorization: `Bearer ${address.hash.slice(1)}` },
		data: { answer: { question: "email", value: "reader@example.test", activeMs: 0 } },
	});
	expect(refused.ok()).toBe(false);

	// Opened again, a finished response thanks and asks nothing: the server cannot know whether
	// an address was left, since the response would then say so.
	await page.reload();
	await expect(heading(page, "Thank you")).toBeVisible();
	await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
	await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("keeps what is on the card when the tab is hidden for good", async ({ page }) => {
	await start(page);
	await forward(page);
	await choose(page, "Most weeks");
	await forward(page);
	await expect(heading(page, "For how many years have you baked bread at home?")).toBeVisible();
	await page.getByRole("textbox").fill("7");
	// Nothing is pressed after typing. The tab goes to the background, as it does when a phone
	// is locked or the browser is closed.
	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
	});
	await expect.poll(async () => (await stored(page)).answers.questions.years?.value).toBe(7);
	// The person had not moved on, so neither has the place they come back to.
	expect((await stored(page)).position).toBe("q:years");
});

test("can be completed with a keyboard alone", async ({ page, isMobile }) => {
	test.skip(isMobile, "A phone has no keyboard to answer with");
	const { keyboard } = page;
	const button = (name: string) => page.getByRole("button", { name, exact: true });
	const press = async (name: string) => {
		await tabTo(page, button(name));
		await keyboard.press("Enter");
	};

	await open(page);
	await tabTo(page, page.getByLabel(CONSENT));
	await keyboard.press("Space");
	await press("Start");
	await expect(heading(page, "You and your kitchen")).toBeFocused();
	await press("Begin");

	// A new card takes the focus at its top, so a screen reader says what it is.
	await expect(heading(page, "How often do you bake bread?")).toBeFocused();
	// Arrow keys move through the answers without moving on; Enter does that.
	await keyboard.press("Tab");
	await keyboard.press("ArrowDown");
	await expect(page.getByRole("radio", { name: "About once a month" })).toBeChecked();
	await expect(heading(page, "How often do you bake bread?")).toBeVisible();
	await keyboard.press("Enter");

	await expect(heading(page, "For how many years have you baked bread at home?")).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.type("4");
	await keyboard.press("Enter");

	await expect(heading(page, "What do you bake for, mostly? Choose up to two.")).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.press("Space");
	await keyboard.press("Enter");

	await expect(heading(page, "What do you bake in most often?")).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.type("Gas");
	await press("Next");

	await expect(heading(page, "Do you keep a sourdough starter?")).toBeFocused();
	// A number key picks an answer on any single choice. Only an item's card moves on by itself.
	await keyboard.press("3");
	await expect(page.getByRole("radio", { name: "No", exact: true })).toBeChecked();
	await expect(heading(page, "Do you keep a sourdough starter?")).toBeVisible();
	await press("Next");

	await expect(heading(page, "How often do you use each of these?")).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.press("Space");
	await press("Next");

	await expect(heading(page, "Which flours are in your kitchen right now?")).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.type("Spelt");
	await keyboard.press("Enter");

	await expect(heading(page, /What matters most to you in a loaf\?/)).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.press("Enter");
	await press("Next");

	await expect(heading(page, "Nine breads")).toBeFocused();
	await press("Begin");

	// An item's card: the focus is on it, so its number keys answer it, and it moves on.
	await expect(heading(page, "Sandwich loaf")).toBeFocused();
	await keyboard.press("3");
	await expect(heading(page, "Sourdough loaf")).toBeFocused();
	for (const next of ["Rye bread", "Brioche"]) {
		await keyboard.press("1");
		await expect(heading(page, next)).toBeFocused();
	}
	await keyboard.press("1");
	// The look back: a line is a button, and Enter on it opens its card. Answered, it comes back.
	await expect(heading(page, "Your answers: Loaves")).toBeFocused();
	await tabTo(page, page.getByRole("button", { name: "Brioche: Never made it. Change" }));
	await keyboard.press("Enter");
	await expect(heading(page, "Brioche")).toBeFocused();
	await keyboard.press("2");
	await expect(heading(page, "Your answers: Loaves")).toBeFocused();
	await expect(
		page.getByRole("button", { name: "Brioche: Made it once or twice. Change" }),
	).toBeVisible();
	await press("Continue");
	await expect(heading(page, /You stopped making 1 of these/)).toBeFocused();
	await press("Continue");

	await expect(heading(page, /Why did you stop making sandwich loaves\?/)).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.press("Space");
	await keyboard.press("Enter");
	await expect(heading(page, "Would you make sandwich loaves again?")).toBeFocused();
	await keyboard.press("1");
	await press("Next");

	for (const [group, items] of [
		["Flatbreads", ["Pita", "Naan", "Flour tortillas"]],
		["Small bakes", ["Bagels", "Soft pretzels"]],
	] as const) {
		await expect(heading(page, group)).toBeFocused();
		await press("Begin");
		for (const next of items) {
			await expect(heading(page, next)).toBeFocused();
			await keyboard.press("5");
		}
		await expect(heading(page, `Your answers: ${group}`)).toBeFocused();
		await press("Continue");
	}
	await expect(heading(page, "Last things")).toBeFocused();
	await press("Begin");
	await expect(heading(page, /Is there anything about baking at home/)).toBeFocused();
	await keyboard.press("Tab");
	await keyboard.type("No, thank you.");
	await press("Finish");
	await expect(heading(page, "Thank you")).toBeFocused();

	const response = await stored(page);
	expect(response.completed).toBe(true);
	expect(response.answers.questions).toMatchObject({
		often: { value: { option: "monthly" } },
		years: { value: 4 },
		reasons: { value: { options: ["taste"] } },
		oven: { value: { option: "gas" } },
		starter: { value: { option: "no" } },
		tools: { value: { rows: { scale: "never" } } },
		flours: { value: { fields: { wheat: "Spelt" } } },
		priorities: { value: { order: ["crust"] } },
		comments: { value: "No, thank you." },
	});
	expect(response.answers.items).toMatchObject({
		"sandwich-loaf": {
			made: { value: { option: "stopped" } },
			"stopped-why": { value: { options: ["time"] } },
			again: { value: { option: "yes" } },
		},
		brioche: { made: { value: { option: "once" }, changes: 1 } },
		"soft-pretzels": { made: { value: { option: "often" } } },
	});
});

test("does not take an arrow key for a tap after a press that was let go elsewhere", async ({
	page,
	isMobile,
}) => {
	test.skip(isMobile, "A phone has no arrow keys");
	await start(page);
	await skipTo(page, "Nine breads");
	await forward(page);
	// The mouse goes down on an answer, is dragged off it and let go: no answer is chosen.
	const box = await page.locator("label").filter({ hasText: "Make it most weeks" }).boundingBox();
	if (!box) throw new Error("The answer is not on the page");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, 20, { steps: 4 });
	await page.mouse.up();
	await expect(page.getByRole("radio", { name: "Make it most weeks" })).not.toBeChecked();

	// Then the keyboard: arrows move through the answers, and the card stays.
	await page.getByRole("radio", { name: "Never made it" }).focus();
	await page.keyboard.press("ArrowDown");
	await expect(page.getByRole("radio", { name: "Made it once or twice" })).toBeChecked();
	await page.waitForTimeout(900);
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
});

test("never shows a percentage or a progress bar", async ({ page }) => {
	await open(page);
	await expectNoProgressDisplay(page);
	await start(page);
	await expectNoProgressDisplay(page);
	await forward(page);
	await expectNoProgressDisplay(page);

	await skipTo(page, "Nine breads");
	await expectNoProgressDisplay(page);
	await forward(page);
	await expectNoProgressDisplay(page);
	await choose(page, STOPPED);
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await expectNoProgressDisplay(page);

	await skipTo(page, /You stopped making 1 of these/);
	await expectNoProgressDisplay(page);
	await forward(page);
	await expectNoProgressDisplay(page);

	await skipTo(page, "Thank you");
	await expectNoProgressDisplay(page);
});

test("moves on by itself only until the person turns that off", async ({ page }) => {
	await start(page);
	await skipTo(page, "Nine breads");
	// The leg says beforehand that cards move on by themselves, and where the switch is.
	await expect(page.getByText("the next item comes up by itself")).toBeVisible();
	await expect(page.getByText("Options, at the top, turns this off.")).toBeVisible();
	const autoAdvance = autoAdvanceSwitch(page);
	// One menu holds it, and nothing of it is on the card.
	await expect(autoAdvance).toBeHidden();
	await openOptions(page);
	await expect(autoAdvance).toBeChecked();
	await autoAdvance.uncheck();
	await closeOptions(page);
	await forward(page);

	await choose(page, "Never made it");
	// Longer than the pause before moving on would have been.
	await page.waitForTimeout(900);
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	await expect(page.getByRole("radio", { name: "Never made it" })).toBeChecked();
	await forward(page);
	await expect(heading(page, "Sourdough loaf")).toBeVisible();

	// The choice is this browser's, and outlasts a reload.
	await expect.poll(async () => (await stored(page)).position).toBe("i:sourdough-loaf:made");
	await page.reload();
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await openOptions(page);
	await expect(autoAdvance).not.toBeChecked();

	// Turned back on, from any card, the next answer moves on again.
	await autoAdvance.check();
	await closeOptions(page);
	await choose(page, "Never made it");
	await expect(heading(page, "Rye bread")).toBeVisible();
});

test("announces moving on, and honours reduced motion", async ({ page }) => {
	await start(page);
	await skipTo(page, "Nine breads");
	await forward(page);
	const card = page.locator("[data-card]");
	// It came from the right, the way the form went.
	await expect(card).toHaveCSS("animation-name", "card-from-right");
	const announcement = page.locator("p[aria-live=polite].sr-only");
	await expect(announcement).toBeEmpty();

	await choose(page, "Never made it");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	// Said to a screen reader without taking the focus. Where the form went is not repeated
	// here: the new card's heading has the focus and says it, with its place, once.
	await expect(announcement).toHaveText("Answer saved.");
	await expect(heading(page, "Sourdough loaf")).toBeFocused();
	await expect(heading(page, "Sourdough loaf")).toHaveAccessibleDescription(
		"Part 2 of 3 · Nine breads Group 1 of 3: Loaves · 2 of 4",
	);
	// One card on the page at a time: the one that left is gone, not sliding somewhere unseen.
	await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

	// A move the person made themselves is not announced as the form's doing, and the card
	// comes from the other side.
	await back(page);
	await expect(announcement).toBeEmpty();
	await expect(card).toHaveCSS("animation-name", "card-from-left");

	await page.emulateMedia({ reducedMotion: "reduce" });
	await forward(page);
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await expect(card).toHaveCSS("animation-name", "none");
});

test("tells the person when the server would not take an answer", async ({ page }) => {
	await start(page);
	await forward(page);
	// The server's refusal of one answer, whatever its reason.
	await page.route("**/api/responses/*/progress", (route) =>
		route.fulfill({ status: 400, json: { error: "This is not an answer the question can take." } }),
	);
	await choose(page, "Most weeks");
	await forward(page);
	// The person has moved on, as always. What they hear is that an answer did not get there.
	await expect(heading(page, "For how many years have you baked bread at home?")).toBeVisible();
	const alert = page.getByRole("alert");
	await expect(alert).toContainText("One of your answers could not be saved");
	await page.unroute("**/api/responses/*/progress");
	await alert.getByRole("button", { name: "OK" }).click();
	await expect(alert).toHaveCount(0);
	expect((await stored(page)).answers.questions).not.toHaveProperty("often");
});

test("counts an answer's time once when the server stored it and the reply was lost", async ({
	page,
}) => {
	await start(page);
	await forward(page);
	// The first answer reaches the server, which stores it, and the page is told 500 instead:
	// what a reply lost on the way back is to the page. Everything after goes through.
	const sent: Array<{ mark: string | undefined; body: Record<string, unknown> }> = [];
	let lost = false;
	await page.route("**/api/responses/*/progress", async (route) => {
		const body = route.request().postDataJSON() as Record<string, unknown>;
		if (!body.answer) return route.continue();
		sent.push({ mark: route.request().headers()["x-save"], body });
		if (lost) return route.continue();
		lost = true;
		await route.fetch();
		await route.fulfill({ status: 500, json: { error: "Something went wrong on our side." } });
	});
	// Long enough on the card that a time counted twice could not pass for one counted once.
	await page.waitForTimeout(400);
	await choose(page, "Most weeks");
	await forward(page);
	await expect(heading(page, "For how many years have you baked bread at home?")).toBeVisible();

	// The page's queue sends it again by itself, the same save with the same mark.
	await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(2);
	// The mark is in a header: the body is what a Worker of any version takes.
	expect(sent[0]?.mark).toMatch(/^[0-9a-f]{32}$/);
	expect(Object.keys(sent[0]?.body ?? {}).sort()).toEqual(["answer", "position"]);
	expect(sent[1]).toEqual(sent[0]);
	const once = (sent[0]?.body.answer as { activeMs: number } | undefined)?.activeMs ?? 0;
	expect(once).toBeGreaterThanOrEqual(400);
	await expect.poll(async () => (await stored(page)).position).toBe("q:years");
	expect((await stored(page)).answers.questions.often).toEqual({
		value: { option: "weekly" },
		activeMs: once,
		changes: 0,
	});
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("lets a single choice and a grid's row go back to no answer", async ({ page }) => {
	await start(page);
	await forward(page);
	// A question card: an answer is given, stored, and then taken back.
	// Its place on the card is kept, so nothing moves when it shows. Until then it is out of
	// reach: not seen, not focusable, not in what a screen reader is given.
	const clear = page.getByRole("button", { name: "Clear my answer", exact: true });
	await expect(clear).toHaveCount(0);
	await expect(page.getByText("Clear my answer", { exact: true })).toBeHidden();
	await choose(page, "Most weeks");
	await forward(page);
	await expect
		.poll(async () => (await stored(page)).answers.questions.often?.value)
		.toEqual({
			option: "weekly",
		});
	await back(page);
	await expect(page.getByRole("radio", { name: "Most weeks" })).toBeChecked();
	await clear.click();
	await expect(page.getByRole("radio", { name: "Most weeks" })).not.toBeChecked();
	await expect(clear).toHaveCount(0);
	// With nothing chosen the card can be passed again, and what is stored is "no answer".
	await page.getByRole("button", { name: "Skip" }).click();
	await expect
		.poll(async () => (await stored(page)).answers.questions.often)
		.toMatchObject({
			value: null,
			changes: 1,
		});

	// An item's card: clearing does not move on, and the card says Skip again.
	await skipTo(page, "Nine breads");
	await setAutoAdvance(page, false);
	await forward(page);
	await choose(page, "Never made it");
	await clear.click();
	await expect(page.getByRole("radio", { name: "Never made it" })).not.toBeChecked();
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
});

test("lets one row of a grid go back to no answer", async ({ page }) => {
	await start(page);
	await skipTo(page, "How often do you use each of these?");
	const scale = page.getByRole("group", { name: "Kitchen scale" });
	await scale.getByText("Every bake").click();
	await page.getByRole("group", { name: "Thermometer" }).getByText("Never").click();
	await page.getByRole("button", { name: "Clear my answer for Kitchen scale" }).click();
	await expect(scale.getByRole("radio", { name: "Every bake" })).not.toBeChecked();
	await expect(page.getByRole("button", { name: "Clear my answer for Kitchen scale" })).toHaveCount(
		0,
	);
	await forward(page);
	await expect
		.poll(async () => (await stored(page)).answers.questions.tools?.value)
		.toEqual({ rows: { thermometer: "never" } });
});
