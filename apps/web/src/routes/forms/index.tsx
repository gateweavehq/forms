import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getUser } from "#/lib/session";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/")({
	loader: async () => {
		const user = await getUser();
		if (!user) throw redirect({ to: "/login", search: { redirect: "/forms" } });
		return { user };
	},
	head: () => ({ meta: [{ title: `${strings.owner.forms} · ${strings.product}` }] }),
	component: FormsPage,
});

function FormsPage() {
	const { user } = Route.useLoaderData();
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">{strings.owner.forms}</h1>
				<Link to="/account" className="text-sm text-muted-foreground underline underline-offset-4">
					{user.email}
				</Link>
			</header>
		</main>
	);
}
