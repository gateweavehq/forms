import { z } from "zod";

/**
 * What this browser remembers, in its own storage. All of it is a convenience: the server holds
 * the answers, and the address holds the way back to them. Storage can be full, switched off or
 * cleared, so nothing here may fail loudly.
 */

const savedSchema = z.object({ id: z.string().min(1), secret: z.string().min(1) });

export type SavedResponse = z.infer<typeof savedSchema>;

function read(key: string): string | undefined {
	try {
		return window.localStorage.getItem(key) ?? undefined;
	} catch {
		return undefined;
	}
}

function write(key: string, value: string | undefined): void {
	try {
		if (value === undefined) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, value);
	} catch {
		// Private windows and full disks: the form works without this.
	}
}

const responseKey = (formId: string) => `forms:response:${formId}`;

/** The response this browser started on a form, so that the form's bare link can offer it again. */
export function rememberedResponse(formId: string): SavedResponse | undefined {
	const text = read(responseKey(formId));
	if (!text) return undefined;
	try {
		const parsed = savedSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

export function rememberResponse(formId: string, saved: SavedResponse): void {
	write(responseKey(formId), JSON.stringify(saved));
}

export function forgetResponse(formId: string): void {
	write(responseKey(formId), undefined);
}

const AUTO_ADVANCE = "forms:auto-advance";

/** Whether a card moves on by itself after an answer. On until the person turns it off. */
export function autoAdvancePreferred(): boolean {
	return read(AUTO_ADVANCE) !== "off";
}

export function preferAutoAdvance(on: boolean): void {
	write(AUTO_ADVANCE, on ? undefined : "off");
}

/** The address that opens a response: its page, with the secret after the `#`. */
export function responseAddress(formId: string, saved: SavedResponse): string {
	return `/f/${encodeURIComponent(formId)}/r/${encodeURIComponent(saved.id)}#${saved.secret}`;
}
