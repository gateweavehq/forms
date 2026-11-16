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
	/** Whether the server would take the answers back if asked now. It decides again when asked. */
	canWithdraw: z.boolean(),
	/** Names the wording the response began under. */
	version: z.string(),
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
	/**
	 * The mark of this save, which the queue gives it (`saveMark`): the same however often it is
	 * sent, so that the server adds an answer's time once when a reply was lost on the way back.
	 * It travels in a header (`sendProgress`), never in the body.
	 */
	save?: string;
}

/**
 * A mark for one save of an answer: 16 random bytes, as text. Random and not a count, because
 * a count would have to be agreed: the same response can be open on two devices, each
 * counting for itself, and a page that is loaded again would have to find out where the last
 * one stopped. Not a time either: a device's clock can be wrong, or the same as another's. A
 * random mark needs nothing kept and nothing asked, and says nothing about the device.
 */
export function saveMark(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

function post(
	path: string,
	body: unknown,
	secret?: string,
	headers: Record<string, string> = {},
): Promise<unknown> {
	return send(path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// In a header, not the address: addresses end up in logs and histories.
			...(secret ? { Authorization: `Bearer ${secret}` } : {}),
			...headers,
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

/**
 * Sends one save. Its mark goes in a header and the body is what it has always been: the
 * server reads the body strictly, and one from before the marks would refuse a key it does not
 * know, which the queue takes for an answer that cannot be stored and drops. A page and the
 * Worker that answers it can be of different versions while a deployment rolls out or back. A
 * header an older Worker does not know is ignored, and the save is stored as it always was.
 */
export async function sendProgress(id: string, secret: string, progress: Progress): Promise<void> {
	const { save, ...body } = progress;
	await post(
		`/api/responses/${encodeURIComponent(id)}/progress`,
		body,
		secret,
		save === undefined ? {} : { "X-Save": save },
	);
}

const completedSchema = z.object({ canWithdraw: z.boolean() });

/** Closes the response. Says whether the answers can still be taken back from then on. */
export async function completeResponse(
	id: string,
	secret: string,
): Promise<{ canWithdraw: boolean }> {
	return completedSchema.parse(
		await post(`/api/responses/${encodeURIComponent(id)}/complete`, {}, secret),
	);
}

/**
 * Withdraws a response: the server deletes it and its answers. Refused with 404 when the form
 * has closed (or the response is gone), and with 409 for a form that lets go of nothing once a
 * response is complete.
 */
export async function withdrawResponse(id: string, secret: string): Promise<void> {
	await send(`/api/responses/${encodeURIComponent(id)}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${secret}` },
	});
}

/** Sends the answers a form keeps apart. Nothing in the request names the response. */
export async function sendDetached(
	formId: string,
	answers: Record<string, AnswerValue>,
): Promise<void> {
	await post(`/api/forms/${encodeURIComponent(formId)}/detached`, { answers });
}
