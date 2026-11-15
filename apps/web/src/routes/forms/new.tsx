import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { BringIn } from "#/components/owner/bring-in";
import { owner } from "#/lib/owner-client";
import { getUser } from "#/lib/session";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/new")({
	loader: async () => {
		if (!(await getUser())) throw redirect({ to: "/login", search: { redirect: "/forms/new" } });
	},
	head: () => ({ meta: [{ title: `${strings.owner.newForm} · ${strings.product}` }] }),
	component: NewFormPage,
});

const created = z.object({ id: z.string() });

function NewFormPage() {
	const router = useRouter();
	const t = strings.owner;
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-2">
				<Link
					to="/forms"
					className="inline-flex min-h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4"
				>
					{t.backToForms}
				</Link>
				<h1 className="text-2xl font-semibold tracking-tight">{t.newTitle}</h1>
				<p className="text-muted-foreground">{t.newLead}</p>
			</div>
			<BringIn
				acceptLabel={t.bringIn.create}
				onAccept={async (definition) => {
					const { id } = created.parse(await owner("POST", "forms", { definition }));
					await router.invalidate();
					await router.navigate({ to: "/forms/$form/settings", params: { form: id } });
				}}
			/>
		</main>
	);
}
