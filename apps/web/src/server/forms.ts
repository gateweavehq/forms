import { type Definition, formatProblems, parseDefinition } from "@gateweave/forms-schema";

export interface Form {
	definition: Definition;
	/** Names this exact wording: a response records which one its answers were given to. */
	hash: string;
}

/**
 * The forms this deployment serves. For now they are the files in the repository's `examples/`,
 * read when the Worker is built. Forms made in a builder and kept in the database will come in
 * through `findForm` too.
 */
const files = import.meta.glob<unknown>("../../../../examples/*.json", {
	eager: true,
	import: "default",
});

function readForms(): Map<string, Definition> {
	const forms = new Map<string, Definition>();
	for (const [path, content] of Object.entries(files)) {
		const parsed = parseDefinition(content);
		// A form that is wrong must not be served half-working. This stops the Worker at its
		// first request, with the file and every problem named.
		if (!parsed.ok)
			throw new Error(`${path} is not a valid form:\n${formatProblems(parsed.problems)}`);
		forms.set(parsed.definition.id, parsed.definition);
	}
	return forms;
}

const forms = readForms();
const hashes = new Map<string, Promise<string>>();

async function hashOf(definition: Definition): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(definition));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The form with this id, or nothing. */
export async function findForm(id: string): Promise<Form | undefined> {
	const definition = forms.get(id);
	if (!definition) return undefined;
	let hash = hashes.get(id);
	if (!hash) {
		hash = hashOf(definition);
		hashes.set(id, hash);
	}
	return { definition, hash: await hash };
}

/** The ids and titles of every form, for the page that lists them. */
export function listForms(): Array<{ id: string; title: string }> {
	return [...forms.values()].map(({ id, title }) => ({ id, title }));
}
