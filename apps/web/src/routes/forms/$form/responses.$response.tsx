import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ConfirmButton } from "#/components/owner/confirm";
import { duration, moment } from "#/lib/format";
import { owner } from "#/lib/owner-client";
import { getResponse } from "#/lib/results";
import { strings } from "#/lib/strings";

/**
 * One response, question by question. It shows what the response holds and nothing else: the
 * answers a form keeps apart are not connected to a response, so they cannot be here.
 */
export const Route = createFileRoute("/forms/$form/responses/$response")({
	loader: async ({ params }) => {
		const response = await getResponse({ data: params });
		if (!response) throw notFound();
		return response;
	},
	component: ResponsePage,
});

const t = strings.owner.results;

function ResponsePage() {
	const response = Route.useLoaderData();
	const { form } = Route.useParams();
	const router = useRouter();

	return (
		<>
			<Link
				to="/forms/$form/responses"
				params={{ form }}
				search={true}
				className="inline-flex min-h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4"
			>
				{t.backToResponses}
			</Link>
			<h2 className="text-lg font-semibold break-all">{t.responseTitle(response.id)}</h2>
			<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
				<div>
					<dt className="text-muted-foreground">{t.state}</dt>
					<dd className="font-medium">
						{response.completedAt === null ? t.incomplete : t.complete}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">{t.device}</dt>
					<dd className="font-medium">{t.devices[response.device]}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">{t.activeTime}</dt>
					<dd className="font-medium">{duration(response.activeMs)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">
						{response.completedAt === null ? t.startedAt : t.completedAt}
					</dt>
					<dd className="font-medium">{moment(response.completedAt ?? response.createdAt)}</dd>
				</div>
			</dl>

			{response.sections.map((section) => (
				<section key={section.title} className="flex flex-col gap-2">
					<h3 className="font-medium break-words">{section.title}</h3>
					<dl className="flex flex-col divide-y rounded-xl border">
						{section.lines.map((line) => (
							<div key={line.label} className="flex flex-col gap-1 px-4 py-3">
								<dt className="text-sm text-muted-foreground break-words">{line.label}</dt>
								<dd className="break-words">
									{line.answer ?? <span className="text-muted-foreground">{t.notShown}</span>}
								</dd>
								<dd className="text-sm text-muted-foreground">
									{duration(line.activeMs)}
									{line.changes > 0 && ` · ${t.changes(line.changes)}`}
								</dd>
							</div>
						))}
					</dl>
				</section>
			))}

			<div>
				<ConfirmButton
					label={t.deleteResponse}
					title={t.deleteResponseTitle}
					confirmLabel={t.deleteResponse}
					onConfirm={async () => {
						await owner(
							"DELETE",
							`forms/${encodeURIComponent(form)}/responses/${encodeURIComponent(response.id)}`,
						);
						await router.invalidate();
						await router.navigate({
							to: "/forms/$form/responses",
							params: { form },
							search: true,
						});
					}}
				>
					<p>{t.deleteResponseBody}</p>
				</ConfirmButton>
			</div>
		</>
	);
}
