import { createServerFn } from "@tanstack/react-start";

/**
 * Who is signed in, for the pages of the people who run forms. A respondent's pages never call
 * this: nothing under `/f/` reads a session.
 */
export const getUser = createServerFn({ method: "GET" }).handler(async () => {
	const { currentUser } = await import("#/server/auth");
	return currentUser();
});

/** Whether new accounts are limited to a list, so the sign-in page can say so. */
export const getSignUpClosed = createServerFn({ method: "GET" }).handler(async () => {
	const { env } = await import("cloudflare:workers");
	const { signUpIsClosed } = await import("#/lib/sign-up-allow");
	return signUpIsClosed(env.SIGN_UP_ALLOW);
});
