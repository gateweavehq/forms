import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { StartPage } from "#/components/start-page";

const form = getRouteApi("/f/$form");

export const Route = createFileRoute("/f/$form/")({ component: Start });

function Start() {
	const { definition, state } = form.useLoaderData();
	// The layout shows a draft's notice and never renders this page for one.
	if (!definition) return null;
	return <StartPage definition={definition} closed={state === "closed"} />;
}
