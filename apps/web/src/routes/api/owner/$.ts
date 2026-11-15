import { createFileRoute } from "@tanstack/react-router";

/** The owner's addresses are one module on the server; this hands every request to it. */
async function toOwner(request: Request, path: string | undefined): Promise<Response> {
	const { handleOwner } = await import("#/server/owner-api");
	return handleOwner(request, path ?? "");
}

export const Route = createFileRoute("/api/owner/$")({
	server: {
		handlers: {
			GET: ({ request, params }) => toOwner(request, params._splat),
			POST: ({ request, params }) => toOwner(request, params._splat),
			DELETE: ({ request, params }) => toOwner(request, params._splat),
		},
	},
});
