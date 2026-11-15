import { expect, type Locator, type Page } from "@playwright/test";

/** The made-up form in `examples/`, which every test answers. */
export const FORM = "/f/home-baking";

export const CONSENT = "I have read this and agree to take part.";

interface StoredAnswer {
	value: unknown;
	activeMs: number;
	changes: number;
}

/** A response as the server holds it. */
export interface Stored {
	answers: {
		questions: Record<string, StoredAnswer>;
		items: Record<string, Record<string, StoredAnswer>>;
	};
	position: string | null;
	completed: boolean;
}

/** A card's heading. Every card has exactly one. */
export function heading(page: Page, name: string | RegExp): Locator {
	return page.getByRole("heading", { level: 1, name });
}

/**
 * Opens the form and waits until its script has taken over the page: the Start button is
 * disabled until then.
 */
export async function open(page: Page): Promise<void> {
	await page.goto(FORM);
	await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
}

/** Gives consent and starts, up to the first leg's opening card. */
export async function start(page: Page): Promise<void> {
	await open(page);
	await page.getByLabel(CONSENT).check();
	await page.getByRole("button", { name: "Start" }).click();
	await expect(heading(page, "You and your kitchen")).toBeVisible();
}

/** Presses the card's forward button, whatever it says at the moment. */
export async function forward(page: Page): Promise<void> {
	await page.getByRole("button", { name: /^(Next|Skip|Continue|Finish)$/ }).click();
}

export async function back(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Back" }).click();
}

/**
 * Picks an option the way a person on this device would: a tap on a phone, a click at a desk.
 * With `blocked`, the option is one the page says cannot be picked right now, and the press
 * goes to it anyway, as a person's would.
 */
export async function choose(page: Page, label: string, { blocked = false } = {}): Promise<void> {
	// An option's box also holds its tick mark and, at a desk, the number of its key.
	const option = page.locator("label").filter({ hasText: new RegExp(`^✓?${literal(label)}\\d?$`) });
	if (await hasTouch(page)) await option.tap({ force: blocked });
	else await option.click({ force: blocked });
}

function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function hasTouch(page: Page): Promise<boolean> {
	return page.evaluate(() => navigator.maxTouchPoints > 0);
}

/** Passes every card without answering until the one with this heading is shown. */
export async function skipTo(page: Page, name: string | RegExp): Promise<void> {
	const target = heading(page, name);
	for (let cards = 0; cards < 60; cards++) {
		if (await target.isVisible()) return;
		const before = await page.getByRole("heading", { level: 1 }).textContent();
		await forward(page);
		// The next card has replaced this one once its heading reads differently.
		await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(before ?? "", {
			timeout: 5_000,
		});
	}
	await expect(target).toBeVisible();
}

/** The response the page is on, read from the server with the secret in the page's address. */
export async function stored(page: Page): Promise<Stored> {
	const url = new URL(page.url());
	const id = url.pathname.split("/").pop() ?? "";
	const response = await page.request.get(`/api/responses/${id}`, {
		headers: { Authorization: `Bearer ${url.hash.slice(1)}` },
	});
	expect(response.status()).toBe(200);
	return (await response.json()) as Stored;
}

/**
 * Nothing on the page counts progress as a share of the whole. A bar or a percentage that
 * crawls through a long section makes people quit, so the product shows legs and nothing else.
 */
export async function expectNoProgressDisplay(page: Page): Promise<void> {
	await expect(page.locator("progress, meter, [role=progressbar], [role=meter]")).toHaveCount(0);
	await expect(page.locator("body")).not.toContainText("%");
}

/** Presses Tab until the element has the focus, as a person without a mouse would. */
export async function tabTo(page: Page, target: Locator): Promise<void> {
	for (let presses = 0; presses < 40; presses++) {
		if (await target.evaluate((element) => element === document.activeElement)) return;
		await page.keyboard.press("Tab");
	}
	await expect(target).toBeFocused();
}

/** How far the page is wider than its window. Above zero, it scrolls sideways. */
export function sidewaysOverflow(page: Page): Promise<number> {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
}
