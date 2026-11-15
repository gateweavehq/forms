import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/responses/$response/complete")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const { postComplete } = await import("#/server/api");
				return postComplete(request, params.response);
			},
		},
	},
});
