import { detachedQuestions, withdrawalOf } from "@gateweave/forms-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * A form as its link shows it, or null when there is no such form. An open or closed form's
 * definition is public: it is what the page shows to anyone with the link. A draft's is not
 * yet, so none comes back. No session is read here: this is the respondent's side.
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

/**
 * A form's consent text, for a copy to print or keep: the current one, or the one the form had
 * under a hash, which is what a response that began earlier agreed to. Null when there is no
 * such form; a draft has none to show yet.
 */
export const getConsent = createServerFn({ method: "GET" })
	.validator(z.object({ form: z.string().min(1).max(64), v: z.string().max(64).optional() }))
	.handler(async ({ data }) => {
		const { findForm, findVersion } = await import("#/server/forms");
		const form = await findForm(data.form);
		if (!form || form.state === "draft") return null;
		const earlier =
			data.v && data.v !== form.hash ? await findVersion(data.form, data.v) : undefined;
		const definition = earlier ?? form.definition;
		return {
			title: definition.title,
			consent: definition.consent ?? null,
			controller: definition.controller ?? null,
			withdrawal: withdrawalOf(definition),
		};
	});

/**
 * What the server stores when someone answers this form, for the page that tells them: the
 * columns of the tables their answers go into, read from the schema itself, with who runs the
 * form and until when answers can be taken back. `v` names the wording a response began under,
 * as for the consent. Null when there is no such form; a draft has no respondents yet.
 */
export const getStored = createServerFn({ method: "GET" })
	.validator(z.object({ form: z.string().min(1).max(64), v: z.string().max(64).optional() }))
	.handler(async ({ data }) => {
		const { findForm, findVersion } = await import("#/server/forms");
		const { HISTORY_DAYS, storedColumns } = await import("#/server/stored");
		const form = await findForm(data.form);
		if (!form || form.state === "draft") return null;
		const earlier =
			data.v && data.v !== form.hash ? await findVersion(data.form, data.v) : undefined;
		const definition = earlier ?? form.definition;
		return {
			title: definition.title,
			controller: definition.controller ?? null,
			withdrawal: withdrawalOf(definition),
			keepsApart: detachedQuestions(definition).length > 0,
			columns: storedColumns(),
			historyDays: HISTORY_DAYS,
		};
	});
