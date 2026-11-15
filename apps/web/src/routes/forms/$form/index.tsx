import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/")({ component: OverviewPage });

const form = getRouteApi("/forms/$form");

function OverviewPage() {
	const { holds, versions } = form.useLoaderData();
	const completed = versions.reduce((sum, version) => sum + version.completed, 0);
	return <p>{strings.owner.counts(holds.responses, completed)}</p>;
}
