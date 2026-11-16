import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { referenceIn } from "./lib/error-reference";

/**
 * Keeps a failure's reference with it on the way out of a server function. Only an error's
 * message crosses to the browser, and the reference of a failed database query may be further in:
 * Better Auth throws its own `Failed to get session` with the database's error as the cause. The
 * page would show the reference where it is rendered on the server and lose it in the browser.
 * So such an error leaves with the reference in its message, and nothing else of its cause.
 * Everything else, a redirect or a "not found" among it, is thrown as it was.
 */
const keepReference = createMiddleware({ type: "function" }).server(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		const reference = referenceIn(error);
		if (!reference || !(error instanceof Error) || referenceIn(new Error(error.message))) {
			throw error;
		}
		throw new Error(`${error.message} (reference ${reference})`);
	}
});

/**
 * Refuses a server function asked from anywhere but the app's own pages, with 403. This is the
 * framework's own default, word for word, and it is listed because a start instance replaces the
 * framework's default request middleware: with `requestMiddleware` left out, the guard is gone
 * and a page of another site can ask a server function with the cookie of whoever is signed in.
 * It goes by `Sec-Fetch-Site`, then `Origin`, then `Referer`, and refuses a request with none.
 * `test/server-functions.test.ts` fails without it.
 */
const fromTheAppOnly = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({
	requestMiddleware: [fromTheAppOnly],
	functionMiddleware: [keepReference],
}));
