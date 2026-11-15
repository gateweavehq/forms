import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LiveButton } from "#/components/live-button";
import { getMyForms } from "#/lib/owner";
import { owner } from "#/lib/owner-client";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/")({
	loader: async () => {
		const mine = await getMyForms();
		if (!mine) throw redirect({ to: "/login", search: { redirect: "/forms" } });
		return mine;
	},
	head: () => ({ meta: [{ title: `${strings.owner.forms} · ${strings.product}` }] }),
	component: FormsPage,
});

const t = strings.owner;

function FormsPage() {
	const { user, forms, examples } = Route.useLoaderData();
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	const addExamples = async () => {
		setBusy(true);
		await owner("POST", "examples").catch(() => undefined);
		await router.invalidate();
		setBusy(false);
	};

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">{t.forms}</h1>
				<Link
					to="/account"
					className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4"
				>
					{user.email}
				</Link>
			</header>
			<Link
				to="/forms/new"
				className="inline-flex min-h-11 items-center self-start rounded-md bg-primary px-4 font-medium text-primary-foreground"
			>
				{t.newForm}
			</Link>
			{forms.length === 0 && <p className="text-muted-foreground">{t.noForms}</p>}
			<ul className="flex flex-col gap-2">
				{forms.map((form) => (
					<li key={form.id}>
						<Link
							to="/forms/$form"
							params={{ form: form.id }}
							className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-input bg-card px-4 py-3 hover:bg-accent"
						>
							<span className="min-w-0 font-medium break-words">{form.title}</span>
							<span className="text-sm text-muted-foreground">
								{t.state[form.state]} · {t.counts(form.started, form.completed)}
							</span>
						</Link>
					</li>
				))}
			</ul>
			{examples > 0 && (
				<section className="flex flex-col gap-3 rounded-xl border p-4">
					<p>{t.examples(examples)}</p>
					<LiveButton
						variant="outline"
						className="self-start"
						disabled={busy}
						onClick={() => void addExamples()}
					>
						{t.addExamples}
					</LiveButton>
				</section>
			)}
		</main>
	);
}
