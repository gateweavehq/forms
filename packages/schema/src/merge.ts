import type { Item } from "./definition";

/** `{{ name }}` with any spacing inside the braces. */
const FIELD = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** The fields a block's question may use in its wording. */
export const ITEM_FIELDS = ["item.label", "item.name"] as const;

/** The field a block's `followUpsIntro` may use. */
export const COUNT_FIELD = "count";

/** The names of the merge fields a text uses, in order, with repeats. */
export function mergeFields(text: string): string[] {
	return [...text.matchAll(FIELD)].map((match) => match[1] ?? "");
}

function merge(text: string, values: Record<string, string>): string {
	// A field with no value stays as written, so a mistake shows instead of leaving a gap.
	return text.replace(FIELD, (whole, name: string) => values[name] ?? whole);
}

/** A block question's wording for one item: `{{item.label}}` and `{{item.name}}` filled in. */
export function mergeItem(text: string, item: Pick<Item, "label" | "name">): string {
	return merge(text, { "item.label": item.label, "item.name": item.name ?? item.label });
}

/** A follow-ups introduction with `{{count}}` filled in. */
export function mergeCount(text: string, count: number): string {
	return merge(text, { [COUNT_FIELD]: String(count) });
}
