import { env } from "cloudflare:workers";
import {
	type Definition,
	definitionSchema,
	formatProblems,
	parseDefinition,
} from "@gateweave/forms-schema";
import { and, eq } from "drizzle-orm";
import { createDb, type Database } from "./db";
import { definition as definitions, form as forms } from "./db/schema";

/** Whether a form takes responses: not yet, now, or no longer. */
export type FormState = "draft" | "open" | "closed";

export interface Form {
	definition: Definition;
	/** Names this exact wording: a response records which one its answers were given to. */
	hash: string;
	state: FormState;
	/** The account the form belongs to. An example served from its file belongs to nobody. */
	ownerId: string | null;
}

/**
 * The made-up forms in the repository's `examples/`, read when the Worker is built. They are
 * served only where `FORMS_EXAMPLES` is `"1"`: local development and the tests. On a deployment
 * a form exists because someone brought it in, and belongs to them.
 */
const files = import.meta.glob<unknown>("../../../../examples/*.json", {
	eager: true,
	import: "default",
});

function readExamples(): Map<string, Definition> {
	const found = new Map<string, Definition>();
	for (const [path, content] of Object.entries(files)) {
		const parsed = parseDefinition(content);
		// A form that is wrong must not be served half-working. This stops the Worker at its
		// first request, with the file and every problem named.
		if (!parsed.ok)
			throw new Error(`${path} is not a valid form:\n${formatProblems(parsed.problems)}`);
		found.set(parsed.definition.id, parsed.definition);
	}
	return found;
}

const exampleForms = readExamples();

/** The examples, when this deployment serves them. */
export function examples(): Definition[] {
	return env.FORMS_EXAMPLES === "1" ? [...exampleForms.values()] : [];
}

/** The hash that names a definition's content: SHA-256 of its JSON, in hex. */
export async function hashOf(definition: Definition): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(definition));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Definitions already read from the database, by hash. A hash names one content for good. */
const read = new Map<string, Definition>();

/** A stored definition's JSON as a definition, parsed once per isolate. */
export function readStored(hash: string, json: string): Definition {
	const known = read.get(hash);
	if (known) return known;
	const parsed = definitionSchema.parse(JSON.parse(json));
	read.set(hash, parsed);
	return parsed;
}

/**
 * The wording a form had under this hash, or nothing when it never had it. A response keeps the
 * definition it began under, so a copy of the consent someone gave has to come from that one.
 */
export async function findVersion(
	id: string,
	hash: string,
	db: Database = createDb(env.DB),
): Promise<Definition | undefined> {
	const row = await db
		.select({ json: definitions.json })
		.from(definitions)
		.where(and(eq(definitions.hash, hash), eq(definitions.formId, id)))
		.get();
	return row ? readStored(hash, row.json) : undefined;
}

/**
 * The form with this id, or nothing. A form in the database wins over an example of the same
 * id, so that an example someone added to their account is theirs from then on.
 */
export async function findForm(
	id: string,
	db: Database = createDb(env.DB),
): Promise<Form | undefined> {
	const row = await db
		.select({
			state: forms.state,
			ownerId: forms.ownerId,
			hash: forms.definitionHash,
			json: definitions.json,
		})
		.from(forms)
		.innerJoin(definitions, eq(definitions.hash, forms.definitionHash))
		.where(eq(forms.id, id))
		.get();
	if (row) {
		return {
			definition: readStored(row.hash, row.json),
			hash: row.hash,
			state: row.state,
			ownerId: row.ownerId,
		};
	}
	const example = examples().find((definition) => definition.id === id);
	if (!example) return undefined;
	return { definition: example, hash: await hashOf(example), state: "open", ownerId: null };
}
