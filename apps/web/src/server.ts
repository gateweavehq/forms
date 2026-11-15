import { env } from "cloudflare:workers";
import handler from "@tanstack/react-start/server-entry";
import { newNonce, withSecurityHeaders } from "./server/security-headers";

/**
 * A deployment without its database or its secret cannot keep responses or sign anyone in, so it
 * serves nothing and says why. A branch's Preview is such a deployment.
 */
function notSetUp() {
	return new Response(
		"This deployment has no database or no BETTER_AUTH_SECRET, so it serves nothing.\n",
		{ status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
	);
}

export default {
	async fetch(request) {
		if (!env.DB || !env.BETTER_AUTH_SECRET) return notSetUp();
		const nonce = newNonce();
		const response = await handler.fetch(request, { context: { nonce } });
		// Vite's dev server adds inline scripts of its own for hot reload, which have no nonce.
		if (import.meta.env.DEV) return response;
		return withSecurityHeaders(request, response, nonce);
	},
} satisfies ExportedHandler<Cloudflare.Env>;
