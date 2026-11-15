import { z } from "zod";

/** What the owner's API said was wrong, in its own words, with the details when it gave any. */
export class OwnerRefused extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly problems: string[],
	) {
		super(message);
	}
}

const refusal = z.object({ error: z.string(), problems: z.array(z.string()).optional() });

/**
 * Sends a request to the owner's API from one of the app's pages. The session cookie goes with
 * it by itself. A refusal comes back as `OwnerRefused`, with words meant for the person.
 */
export async function owner(
	method: "POST" | "DELETE",
	path: string,
	body?: unknown,
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(`/api/owner/${path}`, {
			method,
			headers: body === undefined ? {} : { "Content-Type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	} catch {
		throw new OwnerRefused(0, "", []);
	}
	const data: unknown = await response.json().catch(() => undefined);
	if (response.ok) return data;
	const parsed = refusal.safeParse(data);
	throw new OwnerRefused(
		response.status,
		parsed.success ? parsed.data.error : "",
		parsed.success ? (parsed.data.problems ?? []) : [],
	);
}
