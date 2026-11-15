import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Counted, Nothing } from "#/components/owner/results";
import { duration, moment } from "#/lib/format";
import { getResults, type ResultsOf } from "#/lib/results";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/responses/")({
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }): Promise<ResultsOf<"responses">> => {
		const results = await getResults({ data: { form: params.form, view: "responses", ...deps } });
		if (results?.view !== "responses") throw notFound();
		return results;
	},
	component: ResponsesPage,
});

const t = strings.owner.results;

function ResponsesPage() {
	const { frame, medianMs, responses } = Route.useLoaderData();
	const { form } = Route.useParams();
	return (
		<>
			<Counted frame={frame} />
			{frame.counted === 0 && <Nothing frame={frame} />}
			{medianMs !== null && (
				<p className="text-sm text-muted-foreground">{t.signalsLead(duration(medianMs))}</p>
			)}
			<ul className="flex flex-col gap-2">
				{responses.map((response) => {
					const { fast, straight, changes, activeMs } = response.signals;
					return (
						<li key={response.id}>
							<Link
								to="/forms/$form/responses/$response"
								params={{ form, response: response.id }}
								search={true}
								className="grid gap-x-4 gap-y-1 rounded-lg border border-input bg-card px-4 py-3 hover:bg-accent sm:grid-cols-[1fr_auto]"
								data-response={response.id}
							>
								<span className="font-medium">
									{response.completedAt === null ? t.incomplete : t.complete}
									<span className="font-normal text-muted-foreground">
										{" "}
										· {t.devices[response.device]} · {duration(activeMs)}
									</span>
								</span>
								<span className="text-sm text-muted-foreground">
									{moment(response.completedAt ?? response.createdAt)}
								</span>
								{(fast || straight.length > 0 || changes > 0) && (
									<span className="flex flex-wrap gap-1.5 text-sm sm:col-span-2">
										{fast && <Flag>{t.fast}</Flag>}
										{straight.length > 0 && <Flag>{t.straight(straight)}</Flag>}
										{changes > 0 && <Flag>{t.changed(changes)}</Flag>}
									</span>
								)}
							</Link>
						</li>
					);
				})}
			</ul>
		</>
	);
}

function Flag({ children }: { children: string }) {
	return <span className="rounded-md bg-muted px-2 py-0.5 break-words">{children}</span>;
}
