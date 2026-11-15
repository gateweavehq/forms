import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/forms/$form/responses")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const { startResponse } = await import("#/server/api");
				return startResponse(request, params.form);
			},
		},
	},
});
