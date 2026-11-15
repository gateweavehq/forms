import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/forms/$form/detached")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const { postDetached } = await import("#/server/api");
				return postDetached(request, params.form);
			},
		},
	},
});
