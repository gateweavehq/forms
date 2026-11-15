import handler from "@tanstack/react-start/server-entry";
import { newNonce, withSecurityHeaders } from "./server/security-headers";

export default {
	async fetch(request) {
		const nonce = newNonce();
		const response = await handler.fetch(request, { context: { nonce } });
		// Vite's dev server adds inline scripts of its own for hot reload, which have no nonce.
		if (import.meta.env.DEV) return response;
		return withSecurityHeaders(request, response, nonce);
	},
} satisfies ExportedHandler<Cloudflare.Env>;
