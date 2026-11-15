import { createFileRoute } from "@tanstack/react-router";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-3 px-5 py-10">
			<h1 className="text-2xl font-semibold tracking-tight">{strings.product}</h1>
			<p className="text-base text-muted-foreground">{strings.tagline}</p>
		</main>
	);
}
