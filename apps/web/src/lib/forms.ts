import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * A form's definition, or null when there is no such form. The definition is public: it is what
 * the form's page shows to anyone with its link.
 */
export const getForm = createServerFn({ method: "GET" })
	.validator(z.string().min(1).max(64))
	.handler(async ({ data: id }) => {
		const { findForm } = await import("#/server/forms");
		return (await findForm(id))?.definition ?? null;
	});

/** The forms this deployment serves, for the first page. */
export const getForms = createServerFn({ method: "GET" }).handler(async () => {
	const { listForms } = await import("#/server/forms");
	return listForms();
});
