import { type Definition, parseDefinition } from "@gateweave/forms-schema";
import { type Form, hashOf } from "../forms";

// For tests: a made-up form about tea, with an answer that is typed and one that is kept apart,
// and the rows a form someone owns has. The tests that use it stand in for `cloudflare:workers`,
// which `../forms` reads its settings from.

/** A made-up form: one choice, one typed answer, and an address kept apart. */
export function teaDefinition(id: string): Definition {
	const parsed = parseDefinition({
		version: 1,
		id,
		title: "Tea at work",
		controller: { name: "Made-up Tea Study", contact: "tea-study@example.org" },
		sections: [
			{
				type: "questions",
				id: "tea",
				title: "Your tea",
				questions: [
					{
						id: "drink",
						type: "single_choice",
						label: "Do you drink tea at work?",
						options: [
							{ id: "yes", label: "Yes" },
							{ id: "no", label: "No" },
						],
					},
					{ id: "why", type: "long_text", label: "Why, in your own words?" },
					{
						id: "email",
						type: "email",
						label: "Leave an address for the results, if you like.",
						detached: true,
					},
				],
			},
		],
	});
	if (!parsed.ok) throw new Error("The made-up form is not a valid definition");
	return parsed.definition;
}

/** The form as an example served from its file is: open, with no row and nobody's. */
export async function unownedForm(id: string): Promise<Form> {
	const definition = teaDefinition(id);
	return { definition, hash: await hashOf(definition), state: "open", ownerId: null };
}

/** The form with its rows, open, and the made-up account it belongs to. */
export async function withOwnedForm(d1: D1Database, id: string) {
	const definition = teaDefinition(id);
	const hash = await hashOf(definition);
	const user = { id: `owner-of-${id}`, name: "Test Owner", email: `${id}@example.test` };
	await d1.batch([
		d1
			.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
			.bind(user.id, user.name, user.email),
		d1
			.prepare("INSERT INTO definition (hash, form_id, json) VALUES (?, ?, ?)")
			.bind(hash, id, JSON.stringify(definition)),
		d1
			.prepare(
				`INSERT INTO form (id, owner_id, title, state, definition_hash, created_at, updated_at)
			VALUES (?, ?, ?, 'open', ?, 1, 1)`,
			)
			.bind(id, user.id, definition.title, hash),
	]);
	const form: Form = { definition, hash, state: "open", ownerId: user.id };
	return { form, user };
}
