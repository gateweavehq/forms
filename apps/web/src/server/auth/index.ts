import { env } from "cloudflare:workers";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { mayMakeAccount, parseAllowList } from "../../lib/sign-up-allow";
import { createDb } from "../db";
import { createAuth, TOO_MANY_TRIES } from "./config";

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
	const list = parseAllowList(env.SIGN_UP_ALLOW);
	if (list.ignored.length > 0) {
		// Said once, when the isolate first needs to know who is signed in: an operator who
		// listed a domain would otherwise believe that its people can sign up.
		console.warn(
			`SIGN_UP_ALLOW: ignored ${list.ignored.join(", ")}. Only whole addresses are taken until addresses can be verified.`,
		);
	}
	return createAuth({
		db,
		secret: env.BETTER_AUTH_SECRET,
		baseURL,
		// A deployed Worker answers over HTTPS. Local dev has no certificate.
		secureCookies: !baseURL && !import.meta.env.DEV,
		mayMakeAccount: (email) => mayMakeAccount(env.SIGN_UP_ALLOW, email),
		signUpClosed: list.closed,
		allowTry: async (key) => (await env.AUTH_LIMIT.limit({ key })).success,
	});
}

/** The answer to one try too many, in the shape Better Auth gives its own refusals. */
function tooManyTries(): Response {
	return Response.json({ message: TOO_MANY_TRIES, code: "TOO_MANY_TRIES" }, { status: 429 });
}

/**
 * Everything from outside reaches Better Auth through here, and what could be a guess is
 * counted first.
 *
 * Per sender, for every request that is not a read: the limit per email address (in
 * `config.ts`) stops guessing at one account and does nothing against one sender trying many.
 * The network address is used as the counter's key and nowhere else. This is the accounts'
 * side only: nothing a respondent sends is counted by where it came from.
 *
 * Per account, for a change of password: it asks for the current one, so with a stolen session
 * it is a way to guess at it that the limit per email address never sees.
 */
export async function handleAuthRequest(request: Request): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		// Cloudflare sets this on every request it passes on. Without it (a local run), all
		// senders share one count.
		const sender = request.headers.get("CF-Connecting-IP") || "unknown";
		if (!(await env.AUTH_SENDER_LIMIT.limit({ key: sender })).success) return tooManyTries();
		if (new URL(request.url).pathname.endsWith("/change-password")) {
			const user = await currentUser(request.headers);
			const key = `/change-password ${user?.id ?? ""}`;
			if (user && !(await env.AUTH_LIMIT.limit({ key })).success) return tooManyTries();
		}
	}
	return getAuth().handler(request);
}

/** Who is signed in on this request, or nothing. Only the owner's pages and API ask. */
export async function currentUser(headers: Headers = getRequestHeaders()) {
	const found = await getAuth().api.getSession({ headers });
	return found ? { id: found.user.id, name: found.user.name, email: found.user.email } : null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
