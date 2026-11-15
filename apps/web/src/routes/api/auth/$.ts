import { createFileRoute } from "@tanstack/react-router";

async function toAuth(request: Request): Promise<Response> {
	const { handleAuthRequest } = await import("#/server/auth");
	return handleAuthRequest(request);
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => toAuth(request),
			POST: ({ request }) => toAuth(request),
		},
	},
});
