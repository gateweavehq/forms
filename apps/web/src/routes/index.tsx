import { createFileRoute, Link } from "@tanstack/react-router";
import { getForms } from "#/lib/forms";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/")({
	loader: () => getForms(),
	component: Home,
});

/**
 * The first page. Until there is a builder and accounts, it lists the forms this server has, so
 * that someone who starts it locally finds the example.
 */
function Home() {
	const forms = Route.useLoaderData();
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
			<div className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold tracking-tight">{strings.product}</h1>
				<p className="text-lg text-muted-foreground">{strings.tagline}</p>
			</div>
			<section className="flex flex-col gap-3">
				<h2 className="text-sm font-medium text-muted-foreground">{strings.home.forms}</h2>
				{forms.length === 0 && <p>{strings.home.none}</p>}
				<ul className="flex flex-col gap-2">
					{forms.map((form) => (
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
		</main>
	);
}
