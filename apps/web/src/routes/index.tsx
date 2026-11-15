import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getHome } from "#/lib/owner";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/")({
	loader: async () => {
		const home = await getHome();
		if (home.signedIn) throw redirect({ to: "/forms" });
		return home;
	},
	component: Home,
});

/**
 * The first page, for someone who is not signed in. A deployment's forms are not listed: a
 * form's link is for the people it was sent to. In local development it lists the examples.
 */
function Home() {
	const { examples } = Route.useLoaderData();
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
			<div className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold tracking-tight">{strings.product}</h1>
				<p className="text-lg text-muted-foreground">{strings.tagline}</p>
			</div>
			<Link
				to="/login"
				className="inline-flex min-h-11 items-center self-start rounded-md bg-primary px-4 font-medium text-primary-foreground"
			>
				{strings.auth.signIn}
			</Link>
			{examples.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="text-sm font-medium text-muted-foreground">{strings.home.forms}</h2>
					<ul className="flex flex-col gap-2">
						{examples.map((form) => (
							<li key={form.id}>
								<Link
									to="/f/$form"
									params={{ form: form.id }}
									className="flex min-h-12 items-center rounded-lg border border-input bg-card px-4 py-2.5 font-medium hover:bg-accent"
								>
									{form.title}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
}
