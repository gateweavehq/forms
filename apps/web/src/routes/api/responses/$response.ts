import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/responses/$response")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const { getResponse } = await import("#/server/api");
				return getResponse(request, params.response);
			},
			DELETE: async ({ request, params }) => {
				const { deleteResponse } = await import("#/server/api");
				return deleteResponse(request, params.response);
			},
		},
	},
});
