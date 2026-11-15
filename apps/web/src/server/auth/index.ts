import { env } from "cloudflare:workers";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { mayMakeAccount } from "../../lib/sign-up-allow";
import { createDb } from "../db";
import { createAuth } from "./config";

export const db = createDb(env.DB);

const baseURL = env.BETTER_AUTH_URL || undefined;

let instance: ReturnType<typeof buildAuth> | undefined;

/**
 * The isolate's one Better Auth instance, built on first use: workerd forbids I/O in global
 * scope, and Better Auth starts resolving its context as soon as it is created.
 */
export function getAuth() {
	instance ??= buildAuth();
	return instance;
}

function buildAuth() {
	return createAuth({
		db,
		secret: env.BETTER_AUTH_SECRET,
		baseURL,
		// A deployed Worker answers over HTTPS. Local dev has no certificate.
		secureCookies: !baseURL && !import.meta.env.DEV,
		mayMakeAccount: (email) => mayMakeAccount(env.SIGN_UP_ALLOW, email),
		allowTry: async (key) => (await env.AUTH_LIMIT.limit({ key })).success,
	});
}

/** Everything from outside reaches Better Auth through here. */
export function handleAuthRequest(request: Request): Promise<Response> {
	return getAuth().handler(request);
}

/** Who is signed in on this request, or nothing. Only the owner's pages and API ask. */
export async function currentUser(headers: Headers = getRequestHeaders()) {
	const found = await getAuth().api.getSession({ headers });
	return found ? { id: found.user.id, name: found.user.name, email: found.user.email } : null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
