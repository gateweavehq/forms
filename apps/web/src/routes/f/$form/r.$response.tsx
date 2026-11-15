import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Runner } from "#/components/runner";

const form = getRouteApi("/f/$form");

export const Route = createFileRoute("/f/$form/r/$response")({
	component: ResponsePage,
});

function ResponsePage() {
	const { response } = Route.useParams();
	// Keyed by the response, so that opening another one starts from its own answers.
	return <Runner key={response} definition={form.useLoaderData()} responseId={response} />;
}
