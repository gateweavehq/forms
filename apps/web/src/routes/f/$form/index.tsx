import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { StartPage } from "#/components/start-page";

const form = getRouteApi("/f/$form");

export const Route = createFileRoute("/f/$form/")({
	component: () => <StartPage definition={form.useLoaderData()} />,
});
