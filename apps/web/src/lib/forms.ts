import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * A form as its link shows it, or null when there is no such form. An open or closed form's
 * definition is public: it is what the page shows to anyone with the link. A draft's is not
 * yet, so only its title comes back. No session is read here: this is the respondent's side.
 */
export const getForm = createServerFn({ method: "GET" })
	.validator(z.string().min(1).max(64))
	.handler(async ({ data: id }) => {
		const { findForm } = await import("#/server/forms");
		const form = await findForm(id);
		if (!form) return null;
		if (form.state === "draft") return { state: form.state, definition: null };
		return { state: form.state, definition: form.definition };
	});
