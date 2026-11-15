import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * What the results pages load. Each asks the server whether the form belongs to whoever is
 * signed in before it reads a response; a form that is missing, someone else's, or asked for by
 * nobody signed in comes back as `null`, which the pages show as "not found".
 */

const formId = z.string().min(1).max(64);

/** Which results: a version of the form, and the responses to count. As the address carries them. */
export const resultsSearch = z.object({
	v: z.string().max(64).optional().catch(undefined),
	device: z.enum(["phone", "tablet", "desk"]).optional().catch(undefined),
	q: z.string().max(64).optional().catch(undefined),
	o: z.string().max(64).optional().catch(undefined),
});

export type ResultsSearch = z.infer<typeof resultsSearch>;

const resultsQuery = resultsSearch.extend({
	form: formId,
	view: z.enum(["overview", "questions", "items", "responses"]),
});

export const getResults = createServerFn({ method: "GET" })
	.validator(resultsQuery)
	.handler(async ({ data }) => {
		const { currentUser, db } = await import("#/server/auth");
		const { NotFound, ownedForm } = await import("#/server/owner");
		const { loadRecords, versionOf } = await import("#/server/results");
		const results = await import("@gateweave/forms-results");
		try {
			const row = await ownedForm(db, await currentUser(), data.form);
			const { hash, definition } = await versionOf(db, row, data.v);
			const all = await loadRecords(db, row, hash);
			const filter = { device: data.device, question: data.q, option: data.o };
			const counted = results.applyFilter(definition, all, filter);
			const frame = {
				version: hash,
				/** Responses to this version, and how many of them the filter keeps. */
				all: all.length,
				counted: counted.length,
				filters: results.filterQuestions(definition).map((question) => ({
					id: question.id,
					label: question.label,
					options:
						"options" in question ? question.options.map(({ id, label }) => ({ id, label })) : [],
				})),
			};
			if (data.view === "overview") {
				return { view: data.view, frame, overview: results.overview(definition, counted) };
			}
			if (data.view === "questions") {
				return {
					view: data.view,
					frame,
					sections: results.questionSummaries(definition, counted),
				};
			}
			if (data.view === "items") {
				return { view: data.view, frame, tables: results.repeatTables(definition, counted) };
			}
			// "Fast" is measured against every completed response of the version, filtered or not.
			const signals = results.signals(definition, all);
			const signalsOf = new Map(signals.responses.map((entry) => [entry.id, entry]));
			const kept = new Set(counted.map(({ id }) => id));
			return {
				view: data.view,
				frame,
				medianMs: signals.medianMs,
				// Newest first: the one that just came in is the one being looked for.
				responses: all
					.filter(({ id }) => kept.has(id))
					.reverse()
					.map((record) => ({
						id: record.id,
						device: record.device,
						createdAt: record.createdAt,
						completedAt: record.completedAt,
						signals: signalsOf.get(record.id) ?? {
							id: record.id,
							activeMs: 0,
							fast: false,
							straight: [],
							changes: 0,
						},
					})),
			};
		} catch (error) {
			if (error instanceof NotFound) return null;
			throw error;
		}
	});

type Results = NonNullable<Awaited<ReturnType<typeof getResults>>>;
export type ResultsFrame = Results["frame"];
export type ResultsOf<View extends Results["view"]> = Extract<Results, { view: View }>;

/** One response of one of the signed-in person's forms, question by question. */
export const getResponse = createServerFn({ method: "GET" })
	.validator(z.object({ form: formId, response: z.string().min(1).max(64) }))
	.handler(async ({ data }) => {
		const { currentUser, db } = await import("#/server/auth");
		const { NotFound, ownedForm } = await import("#/server/owner");
		const { loadRecord } = await import("#/server/results");
		const { activeMsOf, responseLines } = await import("@gateweave/forms-results");
		try {
			const row = await ownedForm(db, await currentUser(), data.form);
			const found = await loadRecord(db, row, data.response);
			if (!found) return null;
			const { record, definition, hash } = found;
			return {
				id: record.id,
				device: record.device,
				createdAt: record.createdAt,
				completedAt: record.completedAt,
				activeMs: activeMsOf(record),
				version: hash,
				sections: responseLines(definition, record),
			};
		} catch (error) {
			if (error instanceof NotFound) return null;
			throw error;
		}
	});

/**
 * The answers one of the signed-in person's forms keeps apart, once it is closed and holds
 * enough of them, in an order drawn anew each time. Before that, only why they are not shown.
 */
export const getDetached = createServerFn({ method: "GET" })
	.validator(formId)
	.handler(async ({ data: id }) => {
		const { currentUser, db } = await import("#/server/auth");
		const { NotFound, ownedForm } = await import("#/server/owner");
		const { loadDetached } = await import("#/server/results");
		const { inWords } = await import("@gateweave/forms-results");
		const { isAnswered } = await import("@gateweave/forms-schema");
		try {
			const row = await ownedForm(db, await currentUser(), id);
			const detached = await loadDetached(db, row);
			if (detached.state !== "shown") return detached;
			const { questions, rows } = detached;
			return {
				state: detached.state,
				questions: questions.map(({ id: questionId, label }) => ({ id: questionId, label })),
				rows: rows.map((answers) =>
					questions.map((question) => {
						const value = answers[question.id] as Parameters<typeof inWords>[1] | undefined;
						return isAnswered(value) ? inWords(question, value) : "";
					}),
				),
			};
		} catch (error) {
			if (error instanceof NotFound) return null;
			throw error;
		}
	});
