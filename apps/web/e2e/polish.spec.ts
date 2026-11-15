import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
	back,
	choose,
	expectNoProgressDisplay,
	forward,
	heading,
	setAutoAdvance,
	skipTo,
	start,
	stored,
	tabTo,
} from "./helpers";

const STOPPED = "Used to make it, but stopped";

/** How long the timing test looks at its first card before answering it. */
const LONG_LOOK_MS = 3_000;

/** Up to the first item's card of the repeat leg. */
async function toFirstItem(page: Page): Promise<void> {
	await start(page);
	await skipTo(page, "Nine breads");
	await forward(page);
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	// Once it has arrived: a card measured while it slides in is not where it will be.
	await page
		.locator("[data-card]")
		.evaluate((card) => Promise.all(card.getAnimations().map((animation) => animation.finished)));
}

/** Answers the four loaves, which ends on the look back at them. */
async function answerLoaves(page: Page, answers: [string, string, string, string]): Promise<void> {
	const loaves = ["Sandwich loaf", "Sourdough loaf", "Rye bread", "Brioche"];
	for (const [index, answer] of answers.entries()) {
		await expect(heading(page, loaves[index] ?? "")).toBeVisible();
		await choose(page, answer);
	}
	await expect(heading(page, "Your answers: Loaves")).toBeVisible();
}

/**
 * For every answer on the card: scrolled to, is it whole inside the window and clear of the bar
 * with Back and the way forward? The answers that are not, by their labels.
 */
function answersUnderTheBar(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const bar = document.querySelector("[data-bar]");
		if (!bar) return ["there is no bar"];
		const covered: string[] = [];
		for (const answer of document.querySelectorAll("label:has(input[type=radio])")) {
			answer.scrollIntoView({ block: "nearest" });
			const box = answer.getBoundingClientRect();
			const top = bar.getBoundingClientRect().top;
			const inside = box.top >= 0 && box.bottom <= window.innerHeight;
			// A bar that follows the card lies under the answers and covers nothing.
			const clear = box.bottom <= top + 0.5 || getComputedStyle(bar).position !== "sticky";
			if (!inside || !clear) covered.push((answer.textContent ?? "").trim());
		}
		window.scrollTo(0, 0);
		return covered;
	});
}

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test("Back and the way forward stay at the bottom of the screen, and cover no answer", async ({
		page,
	}) => {
		await toFirstItem(page);
		// The card fits this screen, so the page is where it starts: at its top.
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
		const bar = page.locator("[data-bar]");
		await expect(bar).toHaveCSS("position", "sticky");
		const place = await bar.evaluate((element) => {
			const box = element.getBoundingClientRect();
			return { bottom: box.bottom, height: window.innerHeight };
		});
		// On the bottom edge without any scrolling, where a thumb already is.
		expect(Math.abs(place.bottom - place.height)).toBeLessThanOrEqual(1);
		await expect(bar.getByRole("button", { name: "Back" })).toBeVisible();
		await expect(bar.getByRole("button", { name: "Skip" })).toBeVisible();
		expect(await answersUnderTheBar(page)).toEqual([]);

		// All five answers are on the screen at once, above the bar, in the lower half.
		const answers = await page
			.locator("label:has(input[type=radio])")
			.evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect()));
		const barTop = await bar.evaluate((element) => element.getBoundingClientRect().top);
		expect(answers).toHaveLength(5);
		for (const box of answers) {
			expect(box.top).toBeGreaterThan(844 * 0.4);
			expect(box.bottom).toBeLessThanOrEqual(barTop);
		}

		// With the longer text open the card outgrows the screen, and still nothing is left under.
		await page.getByText("More about it").tap();
		expect(await answersUnderTheBar(page)).toEqual([]);
	});

	test("the answers do not move when one of them is tapped", async ({ page }) => {
		await toFirstItem(page);
		// With the card staying put, so that what is measured is the tap and nothing after it.
		await setAutoAdvance(page, false);
		const answer = page.locator("label").filter({ hasText: STOPPED });
		const before = await answer.boundingBox();
		await answer.tap();
		// The tick is showing, and "Clear my answer" is now there, in a place that was kept for it.
		await expect(page.getByRole("radio", { name: STOPPED })).toBeChecked();
		await expect(page.getByRole("button", { name: "Clear my answer" })).toBeVisible();
		expect(await answer.boundingBox()).toEqual(before);
	});
});

test.describe("on the narrowest phone", () => {
	test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

	test("the bar follows the card, so nothing lies on an answer", async ({ page }) => {
		await toFirstItem(page);
		// Too short a screen to give a tenth of it to a bar: it comes after the card.
		await expect(page.locator("[data-bar]")).toHaveCSS("position", "static");
		expect(await answersUnderTheBar(page)).toEqual([]);
	});

	test("a card too long for the screen starts at its heading, to bring the answers up", async ({
		page,
	}) => {
		await toFirstItem(page);
		const place = () =>
			page.evaluate(() => ({
				scrolled: window.scrollY,
				heading: document.querySelector("h1")?.getBoundingClientRect().top ?? -1,
				answers: [...document.querySelectorAll("label:has(input[type=radio])")].filter(
					(answer) => answer.getBoundingClientRect().bottom <= window.innerHeight,
				).length,
			}));
		const first = await place();
		// The form's title and the lines above the heading have gone up; the heading has not.
		expect(first.scrolled).toBeGreaterThan(0);
		expect(first.heading).toBeGreaterThanOrEqual(0);
		expect(first.heading).toBeLessThan(40);
		// Which puts more of the answers on the screen than starting at the very top would.
		await page.evaluate(() => window.scrollTo(0, 0));
		expect(first.answers).toBeGreaterThan((await place()).answers);

		// Every card of the group starts the same way, so the answers are where they were.
		await choose(page, "Never made it");
		await expect(heading(page, "Sourdough loaf")).toBeVisible();
		const second = await place();
		expect(second.scrolled).toBeGreaterThan(0);
		expect(second.heading).toBeGreaterThanOrEqual(0);

		// A card that fits is left alone.
		await skipTo(page, "Flatbreads");
		expect((await place()).scrolled).toBe(0);
	});

	test("the longer text opens without anything lying on an answer", async ({ page }) => {
		await toFirstItem(page);
		await page.getByText("More about it").tap();
		expect(await answersUnderTheBar(page)).toEqual([]);
	});
});

/**
 * Watches the card from inside the page: when an answer was chosen, when the card began to
 * leave and whether that moved, and when the next card's heading was there.
 */
async function watchTheCard(page: Page): Promise<void> {
	await page.evaluate(() => {
		const seen: { chosen?: number; leaving?: number; moved?: string; changed?: number } = {};
		(window as unknown as { seen: typeof seen }).seen = seen;
		const title = () => document.querySelector("h1")?.textContent;
		const first = title();
		document.addEventListener(
			"change",
			() => {
				seen.chosen ??= performance.now();
			},
			true,
		);
		new MutationObserver(() => {
			const card = document.querySelector("[data-card]");
			if (card?.classList.contains("card-out") && seen.leaving === undefined) {
				seen.leaving = performance.now();
				seen.moved = getComputedStyle(card).animationName;
			}
			if (title() !== first) seen.changed ??= performance.now();
		}).observe(document.body, { subtree: true, childList: true, attributes: true });
	});
}

interface Seen {
	chosen: number;
	leaving: number;
	moved: string;
	changed: number;
}

async function whatWasSeen(page: Page): Promise<Seen> {
	await page.waitForFunction(
		() => (window as unknown as { seen: Partial<Seen> }).seen.changed !== undefined,
	);
	return page.evaluate(() => (window as unknown as { seen: Seen }).seen);
}

test("shows the tick at once, then moves on after the same pause with or without motion", async ({
	page,
}) => {
	await toFirstItem(page);
	await watchTheCard(page);
	const brand = await page.evaluate(() => {
		const probe = document.createElement("span");
		probe.style.backgroundColor = "var(--brand)";
		document.body.append(probe);
		const color = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return color;
	});

	// A long look at the first card, so that its time can be told from the next card's.
	await page.waitForTimeout(LONG_LOOK_MS);
	await choose(page, "Never made it");
	// The answer is filled with the accent and ticked while the card is still this one.
	const answer = page.locator("label").filter({ hasText: "Never made it" });
	await expect(answer).toHaveCSS("background-color", brand);
	await expect(answer.locator("svg")).toHaveCSS("opacity", "1");
	// The fill is not eased in: it is there in the frame after the tap.
	await expect(answer).toHaveCSS("transition-duration", "0s");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	const moving = await whatWasSeen(page);
	expect(moving.moved).toBe("card-to-left");

	// The same again by someone who asked for less motion.
	await page.emulateMedia({ reducedMotion: "reduce" });
	await watchTheCard(page);
	await choose(page, "Never made it");
	await expect(heading(page, "Rye bread")).toBeVisible();
	const still = await whatWasSeen(page);
	expect(still.moved).toBe("none");

	// 260 ms with the tick, 90 ms of leaving, 350 ms in all: by the same timers either way.
	// The bounds are on both sides, so a hold of 340 ms (no time left to leave in) or of 600 ms
	// fails, and so does a pause that is not 350 ms.
	for (const seen of [moving, still]) {
		const hold = seen.leaving - seen.chosen;
		const pause = seen.changed - seen.chosen;
		expect(hold).toBeGreaterThanOrEqual(250);
		expect(hold).toBeLessThan(330);
		expect(pause - hold).toBeGreaterThanOrEqual(50);
		expect(pause).toBeGreaterThanOrEqual(340);
		expect(pause).toBeLessThan(500);
	}
	expect(Math.abs(moving.changed - moving.chosen - (still.changed - still.chosen))).toBeLessThan(
		100,
	);

	// What is stored for a card is the time on that card, pause included, and nothing of the
	// card before it: the first card was looked at for three seconds, the second was not.
	await expect
		.poll(async () => (await stored(page)).answers.items["sourdough-loaf"]?.made?.activeMs ?? 0)
		.toBeGreaterThanOrEqual(340);
	const { items } = (await stored(page)).answers;
	expect(items["sandwich-loaf"]?.made?.activeMs).toBeGreaterThanOrEqual(LONG_LOOK_MS + 340);
	expect(items["sourdough-loaf"]?.made?.activeMs).toBeLessThan(LONG_LOOK_MS - 500);
});

test("does not slide in again when a second answer comes as the card is leaving", async ({
	page,
}) => {
	await toFirstItem(page);
	// The first answer, and the second at the moment the card has begun to leave: the last
	// 90 ms of the pause. What the card does next is written down from inside the page.
	await page.evaluate(() => {
		const tap = (label: Element) => {
			// As a pointer does it: down on the answer, then the click.
			label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
			(label as HTMLElement).click();
		};
		const card = document.querySelector("[data-card]");
		const answers = [...document.querySelectorAll("label:has(input[type=radio])")];
		const first = answers[0];
		const second = answers[1];
		if (!card || !first || !second) throw new Error("The card is not on the page");
		const seen = { started: [] as string[], after: "", again: false };
		(window as unknown as { late: typeof seen }).late = seen;
		card.addEventListener("animationstart", (event) => {
			if (event.target === card) seen.started.push((event as AnimationEvent).animationName);
		});
		new MutationObserver(() => {
			if (!card.classList.contains("card-out") || seen.again) return;
			seen.again = true;
			// Two frames on, as a finger would be: the card has been seen to start leaving.
			const frames = (count: number, then: () => void) =>
				requestAnimationFrame(() => (count > 1 ? frames(count - 1, then) : then()));
			frames(2, () => {
				tap(second);
				frames(2, () => {
					seen.after = getComputedStyle(card).animationName;
				});
			});
		}).observe(card, { attributes: true });
		tap(first);
	});

	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	const late = await page.evaluate(
		() => (window as unknown as { late: { started: string[]; after: string } }).late,
	);
	// It began to leave, was called back by the second answer and stood still, then left for
	// good. At no point did it arrive a second time: standing still it had no animation at all,
	// and the only one it ever started was the leaving (once or twice, as the frames fell).
	expect(late.after).toBe("none");
	expect(late.started.length).toBeGreaterThanOrEqual(1);
	expect(late.started.filter((name) => name !== "card-to-left")).toEqual([]);
	await expect
		.poll(async () => (await stored(page)).answers.items["sandwich-loaf"]?.made)
		.toMatchObject({ value: { option: "once" }, changes: 0 });
});

test("stores the later of two answers given inside the pause, once", async ({ page }) => {
	await toFirstItem(page);
	const sent: string[] = [];
	page.on("request", (request) => {
		const body = request.postData() ?? "";
		if (request.method() === "POST" && body.includes('"item":"sandwich-loaf"')) sent.push(body);
	});
	await page.evaluate(() => {
		const tap = (label: Element) => {
			// As a pointer does it: down on the answer, then the click.
			label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
			(label as HTMLElement).click();
		};
		const answers = [...document.querySelectorAll("label:has(input[type=radio])")];
		const first = answers[0];
		const later = answers[3];
		if (!first || !later) throw new Error("The answers are not on the page");
		tap(first);
		setTimeout(() => tap(later), 120);
	});

	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	// One answer was given as far as the server knows: the later one, and it is not a change.
	await expect
		.poll(async () => (await stored(page)).answers.items["sandwich-loaf"]?.made)
		.toMatchObject({ value: { option: "sometimes" }, changes: 0 });
	expect(sent).toHaveLength(1);
	expect(sent[0]).toContain('"option":"sometimes"');
	// The pause began again at the second answer, so the card was up for both.
	expect(
		(await stored(page)).answers.items["sandwich-loaf"]?.made?.activeMs,
	).toBeGreaterThanOrEqual(120 + 340);
});

test("Back inside the pause keeps the answer and goes back, and nothing moves afterwards", async ({
	page,
}) => {
	await toFirstItem(page);
	await choose(page, "Never made it");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await page.evaluate(() => {
		const tap = (label: Element) => {
			// As a pointer does it: down on the answer, then the click.
			label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
			(label as HTMLElement).click();
		};
		const answer = document.querySelectorAll("label:has(input[type=radio])")[2];
		const goBack = [...document.querySelectorAll<HTMLButtonElement>("[data-bar] button")].find(
			(button) => button.textContent === "Back",
		);
		if (!answer || !goBack) throw new Error("The card is not on the page");
		tap(answer);
		setTimeout(() => goBack.click(), 100);
	});

	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	// The answer that was on the card when Back was pressed is an answer given.
	await expect
		.poll(async () => (await stored(page)).answers.items["sourdough-loaf"]?.made)
		.toMatchObject({ value: { option: "stopped" }, changes: 0 });
	// The pause that was running went with its card: longer than it would have lasted, the
	// person is still where Back took them.
	await page.waitForTimeout(900);
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	expect((await stored(page)).position).toBe("i:sandwich-loaf:made");
});

test("adds the time of an edit from the look back, and touches no other answer", async ({
	page,
}) => {
	await toFirstItem(page);
	await answerLoaves(page, ["Make it most weeks", "Never made it", "Never made it", STOPPED]);
	await expect.poll(async () => Object.keys((await stored(page)).answers.items)).toHaveLength(4);
	const before = (await stored(page)).answers.items;

	await page.getByRole("button", { name: "Rye bread: Never made it. Change" }).click();
	await expect(heading(page, "Rye bread")).toBeVisible();
	await page.waitForTimeout(600);
	await choose(page, "Make it now and then");
	await expect(heading(page, "Your answers: Loaves")).toBeVisible();

	await expect
		.poll(async () => (await stored(page)).answers.items["rye-bread"]?.made?.changes)
		.toBe(1);
	const after = (await stored(page)).answers.items;
	const was = before["rye-bread"]?.made?.activeMs ?? 0;
	// The second visit is added to the first, pause and all: nothing of the first is lost, and
	// the time spent reading the look back is not counted as time on the item.
	expect(after["rye-bread"]?.made).toMatchObject({ value: { option: "sometimes" }, changes: 1 });
	expect(after["rye-bread"]?.made?.activeMs).toBeGreaterThanOrEqual(was + 600 + 340);
	expect(after["rye-bread"]?.made?.activeMs).toBeLessThan(was + 5_000);
	for (const item of ["sandwich-loaf", "sourdough-loaf", "brioche"]) {
		expect(after[item], item).toEqual(before[item]);
	}
});

test("another device that opens during a look back lands on the group's last item", async ({
	page,
	browser,
}) => {
	await toFirstItem(page);
	await answerLoaves(page, ["Make it most weeks", "Never made it", "Never made it", STOPPED]);
	await expect.poll(async () => (await stored(page)).position).toBe("i:brioche:made");

	const elsewhere = await browser.newContext();
	const second = await elsewhere.newPage();
	await second.goto(page.url());
	// The look back is this page's card, not a place in the form: the other device opens the
	// step beside it, with the answer that was given there.
	await expect(heading(second, "Brioche")).toBeVisible();
	await expect(second.getByText("Group 1 of 3: Loaves · 4 of 4")).toBeVisible();
	await expect(second.getByRole("radio", { name: STOPPED })).toBeChecked();
	// One press on, and it is looking back too.
	await second.getByRole("button", { name: "Next", exact: true }).click();
	await expect(heading(second, "Your answers: Loaves")).toBeVisible();
	await expect(second.getByRole("listitem").nth(3)).toHaveText(/Brioche\s*Used to make it/);
	await elsewhere.close();
});

test("marks the items of one group, and a mark goes back to its item", async ({ page }) => {
	await toFirstItem(page);
	const marks = page.getByRole("list", { name: "Items of Loaves" }).getByRole("listitem");
	// One for each of the group's four items, and none for the five items of the other groups.
	await expect(marks).toHaveCount(4);
	await expect(marks.nth(0)).toHaveAttribute("aria-current", "step");
	await expect(marks.nth(0)).toHaveText("Sandwich loaf, this one");
	// Nothing to go back to yet.
	await expect(marks.getByRole("button")).toHaveCount(0);

	await choose(page, "Make it most weeks");
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await choose(page, STOPPED);
	await expect(heading(page, "Rye bread")).toBeVisible();
	await expect(marks.nth(2)).toHaveAttribute("aria-current", "step");
	await expect(marks.nth(3)).toHaveText("Brioche, still to come");
	await expect(marks.getByRole("button")).toHaveCount(2);

	// Back by one, with the mark before this one.
	await marks.getByRole("button", { name: "Sourdough loaf, answered. Go back to it" }).click();
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await expect(page.getByRole("radio", { name: STOPPED })).toBeChecked();
	await expect(marks.nth(1)).toHaveAttribute("aria-current", "step");
	// Rye was seen and passed: its mark is open, and says it has no answer.
	await expect(
		marks.getByRole("button", { name: "Rye bread, no answer yet. Go back to it" }),
	).toBeVisible();
	await expect.poll(async () => (await stored(page)).position).toBe("i:sourdough-loaf:made");

	// The next group has its own marks, and only its own.
	await skipTo(page, "Flatbreads");
	await forward(page);
	await expect(heading(page, "Pita")).toBeVisible();
	await expect(
		page.getByRole("list", { name: "Items of Flatbreads" }).getByRole("listitem"),
	).toHaveCount(3);
	await expect(page.getByRole("list", { name: "Items of Loaves" })).toHaveCount(0);
	await expectNoProgressDisplay(page);
});

test("the marks are one stop for the Tab key, and arrows move between them", async ({
	page,
	isMobile,
}) => {
	test.skip(isMobile, "A phone has no keyboard to answer with");
	await toFirstItem(page);
	for (const next of ["Sourdough loaf", "Rye bread", "Brioche"]) {
		await page.keyboard.press("1");
		await expect(heading(page, next)).toBeFocused();
	}
	const mark = (item: string) =>
		page.getByRole("button", { name: `${item}, answered. Go back to it` });
	// Shift+Tab from the heading lands on the mark just before this item, not on the first.
	await page.keyboard.press("Shift+Tab");
	await expect(mark("Rye bread")).toBeFocused();
	await page.keyboard.press("ArrowLeft");
	await expect(mark("Sourdough loaf")).toBeFocused();
	await page.keyboard.press("ArrowRight");
	await expect(mark("Rye bread")).toBeFocused();
	// One more Shift+Tab leaves the marks altogether.
	await page.keyboard.press("Shift+Tab");
	await expect(page.getByRole("button", { name: "Options" })).toBeFocused();
	await page.keyboard.press("Tab");
	await page.keyboard.press("Enter");
	await expect(heading(page, "Rye bread")).toBeFocused();
});

test("looks back at a group before moving on, and a line changes its answer", async ({ page }) => {
	await toFirstItem(page);
	await answerLoaves(page, ["Make it most weeks", "Never made it", "Never made it", STOPPED]);

	// Every item with the answer it was given, and nothing yet about having stopped.
	const lines = page.getByRole("listitem");
	await expect(lines).toHaveText([
		/Sandwich loaf\s*Make it most weeks/,
		/Sourdough loaf\s*Never made it/,
		/Rye bread\s*Never made it/,
		/Brioche\s*Used to make it, but stopped/,
	]);
	await expect(page.getByText("You stopped making")).toHaveCount(0);
	await expectNoProgressDisplay(page);
	// It is not a step of the form: the place stored is the group's last item.
	await expect.poll(async () => (await stored(page)).position).toBe("i:brioche:made");

	// A slip: brioche was never made. Its line opens its card, and answering comes back here.
	await page.getByRole("button", { name: "Brioche: Used to make it, but stopped. Change" }).click();
	await expect(heading(page, "Brioche")).toBeVisible();
	await expect(page.getByRole("radio", { name: STOPPED })).toBeChecked();
	await choose(page, "Never made it");
	await expect(heading(page, "Your answers: Loaves")).toBeVisible();
	await expect(lines.nth(3)).toHaveText(/Brioche\s*Never made it/);
	await expect
		.poll(async () => (await stored(page)).answers.items.brioche?.made)
		.toMatchObject({ value: { option: "never" }, changes: 1 });

	// One button goes on. Nobody stopped anything now, so the next group opens.
	await forward(page);
	await expect(heading(page, "Flatbreads")).toBeVisible();
	// And Back from there is the look back again, not the last item.
	await back(page);
	await expect(heading(page, "Your answers: Loaves")).toBeVisible();

	// An item that was passed says so, and can be answered from here too.
	await page.getByRole("button", { name: "Rye bread: Never made it. Change" }).click();
	await page.getByRole("button", { name: "Clear my answer" }).click();
	await forward(page);
	await expect(heading(page, "Your answers: Loaves")).toBeVisible();
	await expect(lines.nth(2)).toHaveText(/Rye bread\s*No answer/);
});

test("puts the follow-ups after the look back, never under the answer that caused them", async ({
	page,
}) => {
	await toFirstItem(page);
	await choose(page, STOPPED);
	// The answer that brings more questions looks like any other: the next item comes up.
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await expect(page.getByText("Why did you stop")).toHaveCount(0);
	for (const next of ["Rye bread", "Brioche", "Your answers: Loaves"]) {
		await choose(page, "Never made it");
		await expect(heading(page, next)).toBeVisible();
		await expect(page.getByText("Why did you stop")).toHaveCount(0);
	}
	await forward(page);
	await expect(heading(page, /You stopped making 1 of these/)).toBeVisible();
});

test("opens each part and each later group with what is in it", async ({ page }) => {
	await start(page);
	// A part of questions: how many, and the author's own estimate of the time.
	await expect(page.getByText("Part 1 of 3", { exact: true })).toBeVisible();
	await expect(page.getByText("8 to 9 questions")).toBeVisible();
	await expect(page.getByText("About a minute")).toBeVisible();
	await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();
	await expectNoProgressDisplay(page);

	await skipTo(page, "Nine breads");
	await expect(page.getByText("9 items in 3 groups, one tap each")).toBeVisible();
	await expect(page.getByText("About 2 minutes")).toBeVisible();
	await expect(page.getByRole("listitem")).toHaveText([
		/Loaves\s*4 items/,
		/Flatbreads\s*3 items/,
		/Small bakes\s*2 items/,
	]);
	// Nothing counts down.
	await expect(page.locator("time, [role=timer]")).toHaveCount(0);

	// The first group is opened by the part's own card; the second has one of its own.
	await forward(page);
	await expect(heading(page, "Sandwich loaf")).toBeVisible();
	await skipTo(page, "Flatbreads");
	await expect(page.getByText("Group 2 of 3", { exact: true })).toBeVisible();
	await expect(page.getByText("3 items, one tap each")).toBeVisible();
	await expectNoProgressDisplay(page);

	// A part without an estimate says nothing about time.
	await skipTo(page, "Last things");
	await expect(page.getByText("1 question", { exact: true })).toBeVisible();
	await expect(page.getByText(/About .* minute/)).toHaveCount(0);
});

test("meets the page's parts in the order they are seen", async ({ page }) => {
	await toFirstItem(page);
	// "Made with" is above the bar on a phone and under it at a desk. Whichever it is, the Tab
	// key and a screen reader come to the two in that same order.
	const order = await page.evaluate(() => {
		const links = [...document.querySelectorAll("a")].filter(
			(link) =>
				link.textContent === "Made with Gateweave Forms" && link.getClientRects().length > 0,
		);
		const bar = document.querySelector("[data-bar]");
		const link = links[0];
		if (!bar || !link) return undefined;
		return {
			shown: links.length,
			seenFirst: link.getBoundingClientRect().top < bar.getBoundingClientRect().top,
			metFirst: Boolean(link.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING),
		};
	});
	expect(order?.shown).toBe(1);
	expect(order?.metFirst).toBe(order?.seenFirst);
	const narrow = (page.viewportSize()?.width ?? 0) < 640;
	expect(order?.seenFirst).toBe(narrow);
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	/** Where the card is in the space between the header and the line above the bar. */
	const place = (page: Page) =>
		page.evaluate(() => {
			const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
			const card = box("[data-card]");
			const header = box("header");
			const made = [...document.querySelectorAll("a")]
				.find((link) => link.getClientRects().length > 0)
				?.closest("p")
				?.getBoundingClientRect();
			if (!card || !header || !made) throw new Error("The page is not laid out");
			return { above: card.top - header.bottom, below: made.top - card.bottom };
		});

	test("a card with nothing to press stands in the middle, and one with answers lies on the bar", async ({
		page,
	}) => {
		await start(page);
		// A part's opening: as much room over it as under it.
		const opening = await place(page);
		expect(opening.above).toBeGreaterThan(100);
		expect(Math.abs(opening.above - opening.below)).toBeLessThanOrEqual(1);

		// A question: on the bar, with all the spare room above it.
		await forward(page);
		await expect(heading(page, "How often do you bake bread?")).toBeVisible();
		const question = await place(page);
		expect(question.below).toBeLessThanOrEqual(1);
		expect(question.above).toBeGreaterThan(100);

		// A group's opening and the introduction to its follow-ups stand in the middle too; the
		// look back, whose lines are pressed, lies on the bar.
		await skipTo(page, "Nine breads");
		await forward(page);
		await choose(page, STOPPED);
		await skipTo(page, "Your answers: Loaves");
		expect((await place(page)).below).toBeLessThanOrEqual(1);
		await forward(page);
		await expect(heading(page, /You stopped making 1 of these/)).toBeVisible();
		const intro = await place(page);
		expect(Math.abs(intro.above - intro.below)).toBeLessThanOrEqual(1);
		await skipTo(page, "Flatbreads");
		const group = await place(page);
		expect(Math.abs(group.above - group.below)).toBeLessThanOrEqual(1);
		// The bar has not moved: it is at the bottom of the screen on every one of them.
		const bar = await page
			.locator("[data-bar]")
			.evaluate((element) => element.getBoundingClientRect());
		expect(Math.abs(bar.bottom - 844)).toBeLessThanOrEqual(1);
	});
});

test("says whose form it is, on a card with a surface", async ({ page }) => {
	await start(page);
	await expect(page.getByRole("banner")).toContainText("Bread at home");
	const made = page.getByRole("link", { name: "Made with Gateweave Forms" });
	await expect(made).toHaveAttribute("href", "https://gateweave.com");
	// A new tab: following it must not leave the form half-answered.
	await expect(made).toHaveAttribute("target", "_blank");
	const card = page.locator("[data-card]");
	await expect(card).toHaveCSS("border-top-width", "1px");
	const colors = await card.evaluate((element) => ({
		card: getComputedStyle(element).backgroundColor,
		page: getComputedStyle(element.closest(".bg-page") ?? document.body).backgroundColor,
	}));
	expect(colors.card).not.toBe(colors.page);
});

test("keeps the options in one menu that a keyboard can open and close", async ({
	page,
	isMobile,
}) => {
	test.skip(isMobile, "A phone has no keyboard to answer with");
	await start(page);
	const options = page.getByRole("button", { name: "Options" });
	const autoAdvance = page.getByRole("checkbox", { name: "Move on by itself after an answer" });
	await tabTo(page, options);
	await page.keyboard.press("Enter");
	await expect(options).toHaveAttribute("aria-expanded", "true");
	await page.keyboard.press("Tab");
	await expect(autoAdvance).toBeFocused();
	await page.keyboard.press("Space");
	await expect(autoAdvance).not.toBeChecked();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "Continue on another device" })).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "Your answers and this device" })).toBeFocused();
	// Escape closes it and gives the focus back to its button.
	await page.keyboard.press("Escape");
	await expect(options).toBeFocused();
	await expect(autoAdvance).toBeHidden();
	// Tabbing out of it closes it too: past its three entries, and one more.
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await expect(options).toHaveAttribute("aria-expanded", "false");
	// And the choice was remembered on this device.
	await page.reload();
	await options.click();
	await expect(autoAdvance).not.toBeChecked();
});

test("shows each answer its number key at a desk, and not on a phone", async ({
	page,
	isMobile,
}) => {
	await toFirstItem(page);
	const hints = page.locator("label:has(input[type=radio]) [aria-hidden=true]", {
		hasText: /^\d$/,
	});
	const line = page.getByText("Keys 1 to 5 pick an answer.");
	if (isMobile) {
		await expect(hints.first()).toBeHidden();
		await expect(line).toBeHidden();
		return;
	}
	await expect(hints).toHaveText(["1", "2", "3", "4", "5"]);
	await expect(line).toBeVisible();
	// The card is a column in the middle of the window, not the window's width.
	const box = await page.locator("[data-card]").boundingBox();
	const width = page.viewportSize()?.width ?? 0;
	expect(box?.width).toBeLessThanOrEqual(576);
	expect(Math.abs((box?.x ?? 0) * 2 + (box?.width ?? 0) - width)).toBeLessThanOrEqual(2);
});

test("ends with thanks and the person's own answers, closed until asked for", async ({ page }) => {
	await toFirstItem(page);
	await choose(page, STOPPED);
	await expect(heading(page, "Sourdough loaf")).toBeVisible();
	await skipTo(page, /Why did you stop making sandwich loaves/);
	await choose(page, "It took too long");
	await skipTo(page, /Is there anything about baking at home/);
	await page.getByRole("textbox").fill("More flatbreads, please.");
	await forward(page);

	await expect(heading(page, "Thank you")).toBeVisible();
	await expect(page.getByText("Your answers are saved.")).toBeVisible();
	// The detached questions, as before.
	await expect(page.getByText("One more thing, if you like")).toBeVisible();
	const answers = page.locator("details", { hasText: "What you answered" });
	await expect(answers).not.toHaveAttribute("open");
	await expect(page.getByText("More flatbreads, please.")).toBeHidden();

	await page.getByText("What you answered").click();
	await expect(answers.getByText("Nobody else's are shown.")).toBeVisible();
	await expect(answers.getByRole("heading", { level: 2 })).toHaveText([
		"You and your kitchen",
		"Nine breads: Loaves",
		"Nine breads: Flatbreads",
		"Nine breads: Small bakes",
		"Last things",
	]);
	const line = (label: string) =>
		answers.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) });
	await expect(line("Sandwich loaf").locator("dd")).toHaveText(STOPPED);
	await expect(line("Sourdough loaf").locator("dd")).toHaveText("No answer");
	await expect(
		line("Sandwich loaf: Why did you stop making sandwich loaves? Choose all that fit.").locator(
			"dd",
		),
	).toHaveText("It took too long");
	await expect(answers.getByText("More flatbreads, please.")).toBeVisible();
	// Their own answers and nothing else: no counts, no shares, nothing about other people.
	await expectNoProgressDisplay(page);
	// The detached email is not an answer of the response, and is not in the list.
	await expect(answers.getByText("Would you like the results?")).toHaveCount(0);
	await expect(page.getByRole("link", { name: "Made with Gateweave Forms" })).toBeVisible();

	// Opened again later, the finished response still shows them.
	await page.reload();
	await page.getByText("What you answered").click();
	await expect(line("Sandwich loaf").locator("dd")).toHaveText(STOPPED);
});
