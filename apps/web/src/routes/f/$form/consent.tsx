import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { LiveButton } from "#/components/live-button";
import { Notice } from "#/components/notice";
import { RichTextView } from "#/components/rich-text";
import { getConsent } from "#/lib/forms";
import { strings } from "#/lib/strings";

const t = strings.consentCopy;

/**
 * A form's consent text on a page of its own, to print or save: what a person agreed to is
 * theirs to keep. `v` names the wording a response began under, when the form has changed since.
 */
export const Route = createFileRoute("/f/$form/consent")({
	validateSearch: z.object({ v: z.string().max(64).optional().catch(undefined) }),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		const found = await getConsent({ data: { form: params.form, ...deps } });
		if (!found) throw notFound();
		return found;
	},
	component: ConsentCopy,
});

function ConsentCopy() {
	const { title, consent } = Route.useLoaderData();
	const { form } = Route.useParams();
	const back = (
		<Link to="/f/$form" params={{ form }} className="font-medium underline underline-offset-4">
			{t.back}
		</Link>
	);
	if (!consent) {
		return (
			<Notice title={t.noneTitle} action={back}>
				{t.noneBody}
			</Notice>
		);
	}
	return (
		<main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
			<header className="flex flex-col gap-1">
				<p className="text-sm text-muted-foreground">{t.heading}</p>
				<h1 className="text-2xl font-semibold tracking-tight break-words">
					{consent.title ?? title}
				</h1>
				<p className="text-sm text-muted-foreground break-words">{t.of(title)}</p>
			</header>
			<RichTextView text={consent.text} />
			<section className="flex flex-col gap-1 rounded-xl border p-4">
				<p className="text-sm text-muted-foreground">{t.statement}</p>
				<p className="font-medium break-words">{consent.statement}</p>
			</section>
			{/* What is on paper needs no buttons. */}
			<div className="flex flex-wrap items-center gap-4 print:hidden">
				<LiveButton onClick={() => window.print()}>{t.print}</LiveButton>
				{back}
			</div>
		</main>
	);
}
