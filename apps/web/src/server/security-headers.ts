/** A new value for every response, so a script tag injected into a page cannot guess it. */
export function newNonce(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return btoa(String.fromCharCode(...bytes));
}

/**
 * What a page of Forms may load: its own files and nothing else. A form shows text its author
 * wrote and collects what a respondent types, so a script from elsewhere could read answers as
 * they are given.
 *
 * Nothing may frame a page yet. Embedding a form in another site is planned, with a list of
 * allowed sites per form, and that list is what will go into `frame-ancestors` then.
 */
export function contentSecurityPolicy(nonce: string): string {
	return [
		"default-src 'none'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self'",
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self'",
		"frame-ancestors 'none'",
		"base-uri 'none'",
		"form-action 'self'",
	].join("; ");
}

/** Adds the headers every response gets, and the ones a page gets, to what the app answered. */
export function withSecurityHeaders(request: Request, response: Response, nonce: string): Response {
	const secured = new Response(response.body, response);
	const { headers } = secured;
	headers.set("X-Content-Type-Options", "nosniff");
	// A response's id is in its page's address. This keeps paths from other sites; the secret is
	// in the fragment, which no request carries.
	if (!headers.has("Referrer-Policy")) {
		headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	}
	if (new URL(request.url).protocol === "https:") {
		// Not `includeSubDomains`: on a self-hosted deployment those hosts are someone else's.
		headers.set("Strict-Transport-Security", "max-age=31536000");
	}
	if (
		headers.get("Content-Type")?.startsWith("text/html") &&
		!headers.has("Content-Security-Policy")
	) {
		headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
		// For browsers that predate `frame-ancestors`.
		headers.set("X-Frame-Options", "DENY");
		// The page carries this response's nonce.
		headers.set("Cache-Control", "private, no-store");
	}
	return secured;
}
