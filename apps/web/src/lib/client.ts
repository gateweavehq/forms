import { type AnswerValue, definitionSchema, responseAnswersSchema } from "@gateweave/forms-schema";
import { z } from "zod";
import type { DeviceClass } from "./device";

/** A request the server refused or that never reached it. `status` is 0 when there was no answer. */
export class RequestFailed extends Error {
	constructor(readonly status: number) {
		super(`The request failed (${status || "no answer"})`);
	}
}

const startedSchema = z.object({ id: z.string().min(1), secret: z.string().min(1) });

const responseSchema = z.object({
	form: z.string(),
	answers: responseAnswersSchema,
	position: z.string().nullable(),
	completed: z.boolean(),
	formChanged: z.boolean(),
	/** The definition the response started under, when the form has changed since. */
	definition: definitionSchema.nullable(),
});

export type Started = z.infer<typeof startedSchema>;
export type ResponseState = z.infer<typeof responseSchema>;

/** What is sent as the person moves: an answer as it is given, and where they are now. */
export interface Progress {
	answer?: {
		question: string;
		item?: string;
		value: AnswerValue | null;
		activeMs: number;
	};
	position?: string;
}

async function send(path: string, init: RequestInit): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(path, init);
	} catch {
		throw new RequestFailed(0);
	}
	if (!response.ok) throw new RequestFailed(response.status);
	return response.json();
}

function post(path: string, body: unknown, secret?: string): Promise<unknown> {
	return send(path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// In a header, not the address: addresses end up in logs and histories.
			...(secret ? { Authorization: `Bearer ${secret}` } : {}),
		},
		body: JSON.stringify(body),
		// Lets an answer given just before the tab closes still arrive.
		keepalive: true,
	});
}

export async function startResponse(
	formId: string,
	device: DeviceClass,
	consent: boolean,
): Promise<Started> {
	const path = `/api/forms/${encodeURIComponent(formId)}/responses`;
	return startedSchema.parse(await post(path, { device, ...(consent ? { consent } : {}) }));
}

/** A response's answers and position, or nothing when the id or the secret is not right. */
export async function loadResponse(id: string, secret: string): Promise<ResponseState | undefined> {
	try {
		const data = await send(`/api/responses/${encodeURIComponent(id)}`, {
			headers: { Authorization: `Bearer ${secret}` },
		});
		return responseSchema.parse(data);
	} catch (error) {
		if (error instanceof RequestFailed && error.status === 404) return undefined;
		throw error;
	}
}

export async function sendProgress(id: string, secret: string, progress: Progress): Promise<void> {
	await post(`/api/responses/${encodeURIComponent(id)}/progress`, progress, secret);
}

export async function completeResponse(id: string, secret: string): Promise<void> {
	await post(`/api/responses/${encodeURIComponent(id)}/complete`, {}, secret);
}

/** Sends the answers a form keeps apart. Nothing in the request names the response. */
export async function sendDetached(
	formId: string,
	answers: Record<string, AnswerValue>,
): Promise<void> {
	await post(`/api/forms/${encodeURIComponent(formId)}/detached`, { answers });
}
