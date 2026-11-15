/** A code that leads a label, as research instruments write them: "C01: …", "B2. …". */
const CODE = /^([A-Za-z]{1,4}\d{1,4})\s*[:.)]\s+\S/;

const MAX_WORDS = 6;
const MAX_LENGTH = 40;

/**
 * A readable id from a label: its leading code when it has one ("c01"), else its first words
 * ("how-often-do-you-bake"). Ids end up as column names in an export, where a person has to
 * recognise them.
 */
export function slug(text: string): string {
	const code = CODE.exec(text.trim());
	if (code?.[1]) return code[1].toLowerCase();
	const words = text
		.normalize("NFKD")
		// Accents are marks after NFKD; without them "café" reads "cafe", not "caf".
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	let id = "";
	for (const word of words.slice(0, MAX_WORDS)) {
		const next = id ? `${id}-${word}` : word;
		if (next.length > MAX_LENGTH) break;
		id = next;
	}
	return id || (words[0] ?? "").slice(0, MAX_LENGTH);
}

/** Hands out ids that are unique within one scope, numbering the ones that would repeat. */
export class Ids {
	readonly #used: Set<string>;

	/** `reserved` are ids this scope may not hand out, as if they were taken already. */
	constructor(reserved: Iterable<string> = []) {
		this.#used = new Set(reserved);
	}

	/** An id for this label, or for `fallback` when the label has no letters or digits. */
	take(label: string, fallback: string): string {
		const base = slug(label) || slug(fallback) || "item";
		let id = base;
		for (let n = 2; this.#used.has(id); n++) id = `${base}-${n}`;
		this.#used.add(id);
		return id;
	}
}
