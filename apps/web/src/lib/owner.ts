import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * What the pages of someone who runs forms load. Each asks the server who is signed in and, for
 * a form, whether it is theirs; a form that is missing, someone else's, or asked for by nobody
 * signed in comes back as `null`, and the page shows "not found" for all three.
 */

/** The signed-in person's forms, or null when nobody is signed in. */
export const getMyForms = createServerFn({ method: "GET" }).handler(async () => {
	const { currentUser, db } = await import("#/server/auth");
	const { listForms } = await import("#/server/owner");
	const { examples } = await import("#/server/forms");
	const user = await currentUser();
	if (!user) return null;
	const forms = await listForms(db, user);
	const mine = new Set(forms.map((form) => form.id));
	return {
		user,
		forms,
		/** Example forms this deployment serves that are not in this account yet. */
		examples: examples().filter((example) => !mine.has(example.id)).length,
	};
});

/** One of the signed-in person's forms, with its versions and what it holds. */
export const getOwnedForm = createServerFn({ method: "GET" })
	.validator(z.string().min(1).max(64))
	.handler(async ({ data: id }) => {
		const { currentUser, db } = await import("#/server/auth");
		const { holdings, NotFound, ownedForm, versions } = await import("#/server/owner");
		try {
			const row = await ownedForm(db, await currentUser(), id);
			return {
				id: row.id,
				title: row.title,
				state: row.state,
				versions: await versions(db, row),
				holds: await holdings(db, row),
			};
		} catch (error) {
			if (error instanceof NotFound) return null;
			throw error;
		}
	});

export type OwnedForm = NonNullable<Awaited<ReturnType<typeof getOwnedForm>>>;

/** For the first page: whether someone is signed in, and the examples this server serves. */
export const getHome = createServerFn({ method: "GET" }).handler(async () => {
	const { currentUser } = await import("#/server/auth");
	const { examples } = await import("#/server/forms");
	return {
		signedIn: (await currentUser()) !== null,
		examples: examples().map(({ id, title }) => ({ id, title })),
	};
});
