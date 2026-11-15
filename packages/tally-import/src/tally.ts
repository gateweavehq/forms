import { z } from "zod";

/**
 * One block of a Tally form. A form is a flat list of them: a question is a TITLE block followed
 * by the blocks of its input, which share a `groupUuid`.
 */
const blockSchema = z.object({
	uuid: z.string(),
	type: z.string(),
	groupUuid: z.string(),
	payload: z.record(z.string(), z.unknown()).nullish(),
});

const pagePropsSchema = z.object({
	blocks: z.array(blockSchema),
	name: z.string().nullish(),
	settings: z.record(z.string(), z.unknown()).nullish(),
});

/** What a Tally form's page carries in its `__NEXT_DATA__` script, as far as an import reads it. */
const pageDataSchema = z.union([
	z.object({ props: z.object({ pageProps: pagePropsSchema }) }),
	pagePropsSchema,
]);

export interface TallyBlock {
	uuid: string;
	type: string;
	groupUuid: string;
	payload: Record<string, unknown>;
}

export interface TallyForm {
	/** The name the form has in its author's workspace, used when it has no title block. */
	name: string | undefined;
	blocks: TallyBlock[];
	/** The form's own settings (a progress bar, a closing date, a redirect), none of which is read. */
	settings: Record<string, unknown>;
}

/**
 * Reads a form from the JSON of a Tally page's `__NEXT_DATA__`, or from its `props.pageProps`
 * alone. Returns nothing when the input is neither.
 */
export function readTallyForm(input: unknown): TallyForm | undefined {
	const parsed = pageDataSchema.safeParse(input);
	if (!parsed.success) return undefined;
	const props = "props" in parsed.data ? parsed.data.props.pageProps : parsed.data;
	return {
		name: props.name ?? undefined,
		blocks: props.blocks.map((block) => ({ ...block, payload: block.payload ?? {} })),
		settings: props.settings ?? {},
	};
}

/** The JSON inside a saved Tally page's `__NEXT_DATA__` script, when the text is such a page. */
export function extractPageData(html: string): unknown {
	const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
	if (!match?.[1]) return undefined;
	try {
		return JSON.parse(match[1]);
	} catch {
		return undefined;
	}
}

/**
 * Whether a setting says something: a switch that is on, a number, a text. One that is off or
 * empty asks for nothing, so there is nothing to report about not reading it.
 */
export function isSet(value: unknown): boolean {
	if (value === undefined || value === null || value === false || value === "") return false;
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "object") return Object.values(value).some(isSet);
	return true;
}

export function textOf(payload: Record<string, unknown>, key: string): string | undefined {
	const value = payload[key];
	return typeof value === "string" ? value : undefined;
}

export function flagOf(payload: Record<string, unknown>, key: string): boolean {
	return payload[key] === true;
}

export function numberOf(payload: Record<string, unknown>, key: string): number | undefined {
	const value = payload[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
