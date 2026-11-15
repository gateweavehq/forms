import { env } from "cloudflare:workers";
import { z } from "zod";
import { createDb } from "./db";
import { findForm } from "./forms";
import {
	completeResponse,
	createResponse,
	findResponse,
	Refusal,
	type ResponseRow,
	readAnswers,
	saveDetached,
	saveProgress,
} from "./responses";

/** The largest body a respondent's request may have. A long text answer is a few kilobytes. */
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
			activeMs: z.number().int().min(0).max(MAX_ACTIVE_MS),
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
	const text = await request.text();
	if (text.length > MAX_BODY) throw new Refusal(413, "This is more than a form's answer can be.");
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
		const form = await findForm(row.formId);
		return json({
			form: row.formId,
			answers: await readAnswers(createDb(env.DB), row.id),
			position: row.position,
			completed: row.completedAt !== null,
			// The form was edited since this response began: its answers were given to other words.
			formChanged: form?.hash !== row.definitionHash,
		});
	});
}

/** `POST /api/responses/:id/progress`: stores an answer as it is given, and the new position. */
export function postProgress(request: Request, id: string): Promise<Response> {
	return answering(async () => {
		const row = await responseOf(request, id);
		const body = await readBody(request, progressBody);
		await saveProgress(createDb(env.DB), await formOf(row.formId), row, body);
		return json({ saved: true });
	});
}

/** `POST /api/responses/:id/complete`: marks the response complete. */
export function postComplete(request: Request, id: string): Promise<Response> {
	return answering(async () => {
		const row = await responseOf(request, id);
		await completeResponse(createDb(env.DB), await formOf(row.formId), row);
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
		await saveDetached(createDb(env.DB), form, body.answers);
		return json({ stored: true }, 201);
	});
}
