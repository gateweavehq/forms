import { z } from "zod";

/**
 * Whether a link may go into a form. A definition can come from an import or from someone else,
 * and `javascript:` in a link would run in the respondent's page.
 */
export function isSafeHref(href: string): boolean {
	return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

export const spanSchema = z.strictObject({
	text: z.string().min(1),
	bold: z.boolean().optional(),
	italic: z.boolean().optional(),
	href: z
		.string()
		.refine(isSafeHref, "A link has to start with https://, http:// or mailto:")
		.optional(),
});

/** One paragraph: plain text, or spans when part of it is bold, italic or a link. */
export const paragraphSchema = z.union([z.string(), z.array(spanSchema).min(1)]);

/**
 * Text an author writes around the questions: a consent text, a section's introduction, an
 * item's longer detail. Paragraphs only, with bold, italic and links. A line break inside a
 * paragraph is a newline in its text. It is data, never HTML, so nothing in it can run.
 */
export const richTextSchema = z.array(paragraphSchema).min(1);

export type Span = z.infer<typeof spanSchema>;
export type Paragraph = z.infer<typeof paragraphSchema>;
export type RichText = z.infer<typeof richTextSchema>;

/** The words of a rich text without their formatting, one paragraph to a line. */
export function plainText(text: RichText): string {
	return text
		.map((paragraph) =>
			typeof paragraph === "string" ? paragraph : paragraph.map((span) => span.text).join(""),
		)
		.join("\n");
}
