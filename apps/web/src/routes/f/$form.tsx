import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { Notice } from "#/components/notice";
import { getForm } from "#/lib/forms";
import { strings } from "#/lib/strings";

function FormPages() {
	const { definition } = Route.useLoaderData();
	// A draft has pages only for its owner, under /forms. Here it is not open yet.
	if (!definition) return <Notice title={strings.formDraft.title}>{strings.formDraft.body}</Notice>;
	return <Outlet />;
}

/** A form's pages: its first page and its responses' pages share the definition loaded here. */
export const Route = createFileRoute("/f/$form")({
	loader: async ({ params }) => {
		const form = await getForm({ data: params.form });
		if (!form) throw notFound();
		return form;
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.definition
					? `${loaderData.definition.title} · ${strings.product}`
					: strings.product,
			},
		],
	}),
	component: FormPages,
	notFoundComponent: () => (
		<Notice title={strings.formNotFound.title}>{strings.formNotFound.body}</Notice>
	),
});
