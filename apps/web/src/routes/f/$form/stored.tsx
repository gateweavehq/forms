import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { Contact } from "#/components/about-form";
import { LiveButton } from "#/components/live-button";
import { getStored } from "#/lib/forms";
import { strings } from "#/lib/strings";

const t = strings.stored;

/**
 * What the server stores when someone answers this form, in plain words, on a page of its own
 * to read before answering and to print or keep. The list of what is stored comes from the
 * server's schema, not from this page: it shows a line for every column it is given. `v` names
 * the wording a response began under, when the form has changed since.
 */
export const Route = createFileRoute("/f/$form/stored")({
	validateSearch: z.object({ v: z.string().max(64).optional().catch(undefined) }),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		const found = await getStored({ data: { form: params.form, ...deps } });
		if (!found) throw notFound();
		return found;
	},
	component: StoredPage,
});

const heading = "text-lg font-semibold";

function Columns({ table, columns }: { table: string; columns: string[] }) {
	return (
		<ul className="flex list-disc flex-col gap-1.5 pl-5">
			{columns.map((column) => {
				const line = t.columns[table]?.[column];
				return (
					// A column nobody has described yet is still shown, by its name: the page must not
					// leave out something the server stores.
					<li
						key={column}
						data-stored={`${table}.${column}`}
						data-undescribed={line ? undefined : ""}
						className="break-words"
					>
						{line ?? column}
					</li>
				);
			})}
		</ul>
	);
}

function StoredPage() {
	const { title, controller, withdrawal, keepsApart, columns, historyDays } = Route.useLoaderData();
	const { form } = Route.useParams();
	return (
		<main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
			<header className="flex flex-col gap-1">
				<h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
				<p className="text-sm text-muted-foreground break-words">{t.of(title)}</p>
			</header>
			<p>{t.lead}</p>

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.controllerTitle}</h2>
				{controller ? (
					<>
						<p className="break-words">
							<span className="font-medium">{controller.name}</span>
							{" · "}
							<Contact contact={controller.contact} />
						</p>
						<p className="text-sm text-muted-foreground">{t.controllerBody}</p>
					</>
				) : (
					<p>{t.noController}</p>
				)}
			</section>

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.notTitle}</h2>
				<ul className="flex list-disc flex-col gap-1.5 pl-5">
					{t.not.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.tables.response}</h2>
				<Columns table="response" columns={columns.response} />
			</section>

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.tables.answer}</h2>
				<Columns table="answer" columns={columns.answer} />
			</section>

			{keepsApart && (
				<section className="flex flex-col gap-2">
					<h2 className={heading}>{t.tables.detachedAnswer}</h2>
					<p>{t.detachedLead}</p>
					<Columns table="detachedAnswer" columns={columns.detachedAnswer} />
					<p>{t.detachedLimit}</p>
				</section>
			)}

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.withdrawTitle}</h2>
				<p>{strings.about.withdrawal[withdrawal]}</p>
				<p>{t.withdrawDoes}</p>
				<p>{t.withdrawCount}</p>
				{keepsApart && <p>{t.withdrawDetached}</p>}
				<p>{t.withdrawCopies}</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.historyTitle}</h2>
				<p>{t.history(historyDays)}</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className={heading}>{t.logTitle}</h2>
				<p>{t.log}</p>
			</section>

			{/* What is on paper needs no buttons. */}
			<div className="flex flex-wrap items-center gap-4 print:hidden">
				<LiveButton onClick={() => window.print()}>{t.print}</LiveButton>
				<Link
					to="/f/$form"
					params={{ form }}
					className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
				>
					{t.back}
				</Link>
			</div>
		</main>
	);
}
