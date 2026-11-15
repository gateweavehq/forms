import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/responses/$response/progress")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const { postProgress } = await import("#/server/api");
				return postProgress(request, params.response);
			},
		},
	},
});
