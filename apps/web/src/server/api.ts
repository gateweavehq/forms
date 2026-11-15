import { env } from "cloudflare:workers";
import { z } from "zod";
import { readCapped, TooLarge } from "./body";
import { createDb } from "./db";
import { findForm } from "./forms";
import {
	completeResponse,
	createResponse,
	definitionOf,
	findResponse,
	Refusal,
	type ResponseRow,
	readAnswers,
	saveDetached,
	saveProgress,
} from "./responses";

/** The most bytes a respondent's request may have. A long text answer is a few kilobytes. */
const MAX_BODY = 64_000;

/** The longest a single visit to a question is believed to have lasted: a day. */
const MAX_ACTIVE_MS = 86_400_000;

const createBody = z.strictObject({
	device: z.enum(["phone", "tablet", "desk"]),
	/** Has to be `true` for a form with a consent step: nothing is stored before it is given. */
	consent: z.boolean().optional(),
});

const progressBody = z.strictObject({
	answer: z
		.strictObject({
			question: z.string().min(1).max(64),
			item: z.string().min(1).max(64).optional(),
			value: z.unknown(),
			// Any number: a time that cannot be is brought into range, not refused. Refusing would
			// throw the answer away with it, over a clock that ran in a tab left open for days.
			activeMs: z.number(),
		})
		.optional(),
	position: z.string().min(1).max(160).optional(),
});

const detachedBody = z.strictObject({ answers: z.record(z.string().max(64), z.unknown()) });

function json(body: unknown, status = 200): Response {
	// Answers are one person's, and a response's state changes with every tap.
	return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function refuse(status: number, error: string, details: Record<string, unknown> = {}): Response {
	return json({ error, ...details }, status);
}

/** Reads a JSON body of the given shape, or says why it could not. */
async function readBody<Shape>(request: Request, schema: z.ZodType<Shape>): Promise<Shape> {
	// Only a page of this origin can send JSON without the browser asking first, so this also
	// keeps another site's form from posting here.
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
		throw new Refusal(415, "Send JSON.");
	}
	let text: string;
	try {
		text = await readCapped(request, MAX_BODY);
	} catch (error) {
		if (error instanceof TooLarge) {
			throw new Refusal(413, "This is more than a form's answer can be.");
		}
		throw error;
	}
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Refusal(400, "This is not JSON.");
	}
	const parsed = schema.safeParse(data);
	if (!parsed.success) throw new Refusal(400, "This is not what this address takes.");
	return parsed.data;
}

/** The secret a request presents. It travels in a header, never in the address, so no log has it. */
function presentedSecret(request: Request): string {
	const header = request.headers.get("Authorization") ?? "";
	return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

const NOT_FOUND = "There is no such response, or the link to it is incomplete.";

/** Runs a handler and turns a refusal into its answer. Anything else is a fault of ours. */
async function answering(handler: () => Promise<Response>): Promise<Response> {
	try {
		return await handler();
	} catch (error) {
		if (error instanceof Refusal) return refuse(error.status, error.message, error.details);
		// The name only: a message could quote what a respondent sent.
		console.error(`responses: ${error instanceof Error ? error.name : "failure"}`);
		return refuse(500, "Something went wrong on our side. Your earlier answers are safe.");
	}
}

/**
 * Counts one more use of an open address against its form's ceiling. The key is the form, not
 * the sender: nothing about who asks is read here.
 */
async function withinCeiling(limiter: RateLimit, formId: string, busy: string): Promise<void> {
	const { success } = await limiter.limit({ key: formId });
	if (!success) throw new Refusal(429, busy);
}

async function formOf(id: string) {
	const form = await findForm(id);
	if (!form) throw new Refusal(404, "There is no such form.");
	return form;
}

async function responseOf(request: Request, id: string): Promise<ResponseRow> {
	const row = await findResponse(createDb(env.DB), id, presentedSecret(request));
	if (!row) throw new Refusal(404, NOT_FOUND);
	return row;
}

/** `POST /api/forms/:form/responses`: starts a response, and returns its id and secret once. */
export function startResponse(request: Request, formId: string): Promise<Response> {
	return answering(async () => {
		const form = await formOf(formId);
		const body = await readBody(request, createBody);
		await withinCeiling(
			env.START_LIMIT,
			form.definition.id,
			"Many people are starting this form right now. Try again in a minute.",
		);
		if (form.definition.consent && body.consent !== true) {
			throw new Refusal(400, "This form starts once its consent is given.");
		}
		return json(await createResponse(createDb(env.DB), form, body.device), 201);
	});
}

/** `GET /api/responses/:id`: the answers so far and where the person stopped. */
export function getResponse(request: Request, id: string): Promise<Response> {
	return answering(async () => {
		const row = await responseOf(request, id);
		const db = createDb(env.DB);
		const form = await findForm(row.formId);
		const formChanged = form?.hash !== row.definitionHash;
		return json({
			form: row.formId,
			answers: await readAnswers(db, row.id),
			position: row.position,
			completed: row.completedAt !== null,
			// The form was edited since this response began. The response goes on under the
			// definition it started with, which the page does not have, so it is sent along.
			formChanged,
			definition: formChanged ? await definitionOf(db, row) : null,
		});
	});
}

/** `POST /api/responses/:id/progress`: stores an answer as it is given, and the new position. */
export function postProgress(request: Request, id: string): Promise<Response> {
	return answering(async () => {
		const row = await responseOf(request, id);
		const body = await readBody(request, progressBody);
		if (body.answer) {
			const { activeMs } = body.answer;
			body.answer.activeMs = Math.min(Math.max(Math.round(activeMs), 0), MAX_ACTIVE_MS);
		}
		const db = createDb(env.DB);
		await saveProgress(db, await definitionOf(db, row), row, body);
		return json({ saved: true });
	});
}

/** `POST /api/responses/:id/complete`: marks the response complete. */
export function postComplete(request: Request, id: string): Promise<Response> {
	return answering(async () => {
		const row = await responseOf(request, id);
		const db = createDb(env.DB);
		await completeResponse(db, await definitionOf(db, row), row);
		return json({ completed: true });
	});
}

/**
 * `POST /api/forms/:form/detached`: stores the answers a form keeps apart. It takes no response
 * id and no secret, on purpose: nothing in this request says whose answers they go with.
 */
export function postDetached(request: Request, formId: string): Promise<Response> {
	return answering(async () => {
		const form = await formOf(formId);
		const body = await readBody(request, detachedBody);
		await withinCeiling(
			env.DETACHED_LIMIT,
			form.definition.id,
			"Many people are sending this right now. Try again in a minute.",
		);
		await saveDetached(createDb(env.DB), form, body.answers);
		return json({ stored: true }, 201);
	});
}
