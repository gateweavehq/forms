import { isSafeHref, type Paragraph, type RichText, type Span } from "@gateweave/forms-schema";

interface Style {
	bold?: true;
	italic?: true;
	href?: string;
}

/** Tags that start a paragraph of their own. Everything else runs on in the same line. */
const BLOCK_TAGS = new Set(["div", "p", "li", "ul", "ol", "blockquote", "h1", "h2", "h3"]);

const ENTITIES: Record<string, string> = {
	// Tally's editor leaves non-breaking spaces around bold and linked words. They are an artefact
	// of typing, not wording, and would stop an item's name from matching inside a sentence.
	nbsp: " ",
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

export function decodeEntities(text: string): string {
	return text
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
			if (name.startsWith("#x") || name.startsWith("#X")) {
				return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
			}
			if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
			return ENTITIES[name.toLowerCase()] ?? whole;
		})
		.replace(/ /g, " ");
}

function attributes(value: unknown): Map<string, string> {
	const found = new Map<string, string>();
	if (!Array.isArray(value)) return found;
	for (const pair of value) {
		if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string") {
			found.set(pair[0], pair[1]);
		}
	}
	return found;
}

function styled(style: Style, attrs: Map<string, string>): Style {
	const next: Style = { ...style };
	const tag = attrs.get("tag");
	const weight = attrs.get("font-weight");
	if (tag === "b" || tag === "strong" || weight === "bold" || Number(weight) >= 600) {
		next.bold = true;
	}
	if (tag === "i" || tag === "em" || attrs.get("font-style") === "italic") next.italic = true;
	const href = attrs
		.get("href")
		?.trim()
		.replace(/^mailto:\s+/i, "mailto:");
	// A link that is not a web or mail address keeps its words and loses its target.
	if (href && isSafeHref(href)) next.href = href;
	return next;
}

function sameStyle(a: Span, b: Span): boolean {
	return a.bold === b.bold && a.italic === b.italic && a.href === b.href;
}

class Paragraphs {
	readonly #done: Span[][] = [];
	#current: Span[] = [];

	add(text: string, style: Style): void {
		if (text === "") return;
		const span: Span = { text, ...style };
		const last = this.#current[this.#current.length - 1];
		if (last && sameStyle(last, span)) last.text += text;
		else this.#current.push(span);
	}

	break(): void {
		if (this.#current.length > 0) this.#done.push(this.#current);
		this.#current = [];
	}

	finish(): RichText | undefined {
		this.break();
		const paragraphs: Paragraph[] = [];
		for (const spans of this.#done) {
			const first = spans[0];
			const last = spans[spans.length - 1];
			if (first) first.text = first.text.trimStart();
			if (last) last.text = last.text.trimEnd();
			const kept = spans.filter((span) => span.text !== "");
			const only = kept[0];
			if (!only) continue;
			const plain = kept.length === 1 && !only.bold && !only.italic && !only.href;
			paragraphs.push(plain ? only.text : kept);
		}
		return paragraphs.length > 0 ? paragraphs : undefined;
	}
}

function walk(nodes: unknown, style: Style, into: Paragraphs): void {
	if (!Array.isArray(nodes)) return;
	for (const node of nodes) {
		if (typeof node === "string") {
			into.add(decodeEntities(node), style);
			continue;
		}
		if (!Array.isArray(node)) continue;
		const [content, attrs] = node as [unknown, unknown];
		const found = attributes(attrs);
		const tag = found.get("tag") ?? "";
		const own = styled(style, found);
		if (BLOCK_TAGS.has(tag)) into.break();
		if (tag === "br") into.add("\n", style);
		if (typeof content === "string") into.add(decodeEntities(content), own);
		else walk(content, own, into);
		if (BLOCK_TAGS.has(tag)) into.break();
	}
}

/**
 * Tally keeps formatted text as nested `[content, attributes]` pairs (`safeHTMLSchema`). This
 * keeps the words, the paragraphs, bold, italic and links, and nothing else. Nothing when the
 * block holds no words.
 */
export function richText(schema: unknown): RichText | undefined {
	const paragraphs = new Paragraphs();
	walk(schema, {}, paragraphs);
	return paragraphs.finish();
}

/** The words of a rich text on one line, for a label. */
export function oneLine(text: RichText | undefined): string {
	if (!text) return "";
	return text
		.map((paragraph) =>
			typeof paragraph === "string" ? paragraph : paragraph.map((span) => span.text).join(""),
		)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Whether any of the text is bold, italic or a link. */
export function isFormatted(text: RichText): boolean {
	return text.some((paragraph) => typeof paragraph !== "string");
}
