import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { Notice } from "#/components/notice";
import { getOwnedForm } from "#/lib/owner";
import { resultsSearch } from "#/lib/results";
import { strings } from "#/lib/strings";

const t = strings.owner;

/**
 * The pages of one form, for its owner. The loader is where ownership is asked, on the server:
 * a missing form, someone else's and a visitor who is not signed in all get "not found".
 */
export const Route = createFileRoute("/forms/$form")({
	// Which version and which responses the results count. Every tab reads them, so they
	// are kept when moving between tabs.
	validateSearch: resultsSearch,
	loader: async ({ params }) => {
		const form = await getOwnedForm({ data: params.form });
		if (!form) throw notFound();
		return form;
	},
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.title ?? t.notFound.title} · ${strings.product}` }],
	}),
	component: FormLayout,
	notFoundComponent: () => <Notice title={t.notFound.title}>{t.notFound.body}</Notice>,
});

const tabs = [
	["/forms/$form", t.nav.overview],
	["/forms/$form/items", t.nav.items],
	["/forms/$form/questions", t.nav.questions],
	["/forms/$form/responses", t.nav.responses],
	["/forms/$form/detached", t.nav.detached],
	["/forms/$form/settings", t.nav.settings],
] as const;

function FormLayout() {
	const form = Route.useLoaderData();
	return (
		<div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
			<header className="flex flex-col gap-2">
				<Link
					to="/forms"
					className="inline-flex min-h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4"
				>
					{t.backToForms}
				</Link>
				<h1 className="text-2xl font-semibold tracking-tight break-words">{form.title}</h1>
				<p className="text-sm text-muted-foreground">
					{t.state[form.state]} · {t.link}:{" "}
					<Link to="/f/$form" params={{ form: form.id }} className="underline underline-offset-4">
						/f/{form.id}
					</Link>
				</p>
			</header>
			<nav aria-label={form.title} className="-mx-1 flex flex-wrap gap-1 border-b pb-2">
				{tabs.map(([to, label]) => (
					<Link
						key={to}
						to={to}
						params={{ form: form.id }}
						search={true}
						// The overview is the form's own address, which every other tab's begins with.
						activeOptions={{ exact: to === "/forms/$form" }}
						className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
					>
						{label}
					</Link>
				))}
			</nav>
			<main className="flex flex-col gap-6 pb-10">
				<Outlet />
			</main>
		</div>
	);
}
