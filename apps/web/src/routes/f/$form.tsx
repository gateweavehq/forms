import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { Notice } from "#/components/notice";
import { getForm } from "#/lib/forms";
import { strings } from "#/lib/strings";

/** A form's pages: its first page and its responses' pages share the definition loaded here. */
export const Route = createFileRoute("/f/$form")({
	loader: async ({ params }) => {
		const definition = await getForm({ data: params.form });
		if (!definition) throw notFound();
		return definition;
	},
	head: ({ loaderData }) => ({
		meta: [{ title: loaderData ? `${loaderData.title} · ${strings.product}` : strings.product }],
	}),
	component: Outlet,
	notFoundComponent: () => (
		<Notice title={strings.formNotFound.title}>{strings.formNotFound.body}</Notice>
	),
});
