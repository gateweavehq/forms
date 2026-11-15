import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";
import { Bar, Counted, Nothing, shareOf } from "#/components/owner/results";
import { duration, percent } from "#/lib/format";
import { getResults, type ResultsOf } from "#/lib/results";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/")({
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }): Promise<ResultsOf<"overview">> => {
		const results = await getResults({ data: { form: params.form, view: "overview", ...deps } });
		if (results?.view !== "overview") throw notFound();
		return results;
	},
	component: OverviewPage,
});

const form = getRouteApi("/forms/$form");
const t = strings.owner.results;

function OverviewPage() {
	const { frame, overview } = Route.useLoaderData();
	const { id } = form.useLoaderData();
	const open = overview.started - overview.completed;
	const exportAddress = (name: string) =>
		`/api/owner/forms/${encodeURIComponent(id)}/export/${name}.csv?v=${frame.version}`;
	const link =
		"inline-flex min-h-11 items-center rounded-md border border-input bg-background px-4 font-medium hover:bg-accent";

	return (
		<>
			<Counted frame={frame} />
			{frame.counted === 0 ? (
				<Nothing frame={frame} />
			) : (
				<>
					<dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div className="rounded-xl border p-4">
							<dt className="text-sm text-muted-foreground">{t.started}</dt>
							<dd className="text-2xl font-semibold tabular-nums" data-testid="started">
								{overview.started}
							</dd>
						</div>
						<div className="rounded-xl border p-4">
							<dt className="text-sm text-muted-foreground">{t.completed}</dt>
							<dd className="text-2xl font-semibold tabular-nums" data-testid="completed">
								{overview.completed}
							</dd>
						</div>
						<div className="col-span-2 rounded-xl border p-4 sm:col-span-1">
							<dt className="text-sm text-muted-foreground">{t.completedShare}</dt>
							<dd className="text-2xl font-semibold tabular-nums">
								{overview.completedShare === null ? "" : percent(overview.completedShare)}
							</dd>
							<dd className="text-sm text-muted-foreground">
								{t.ofStarted(overview.completed, overview.started)}
							</dd>
						</div>
					</dl>

					<section className="flex flex-col gap-3">
						<h2 className="text-lg font-semibold">{t.timeTitle}</h2>
						<p className="text-sm text-muted-foreground">{t.timeLead}</p>
						<ul className="flex flex-col divide-y rounded-xl border">
							{overview.activeTime.map((row) => (
								<li
									key={row.device}
									className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-3"
								>
									<span className="font-medium">
										{row.device === "all" ? t.allDevices : t.devices[row.device]}
									</span>
									<span className="tabular-nums">
										{row.medianMs === null
											? t.noTime
											: `${duration(row.medianMs)} · ${t.timeRow(row.completed)}`}
									</span>
								</li>
							))}
						</ul>
					</section>

					<section className="flex flex-col gap-3">
						<h2 className="text-lg font-semibold">{t.stoppedTitle}</h2>
						{open === 0 ? (
							<p className="text-muted-foreground">{t.stoppedNone}</p>
						) : (
							<>
								<p className="text-sm text-muted-foreground">{t.stoppedLead(open)}</p>
								<ul className="flex flex-col gap-3">
									{[
										{ key: "start", label: t.stoppedAtStart, count: overview.stoppedAtStart },
										...overview.stopped.map((place) => ({
											key: `${place.sectionId} ${place.groupId ?? ""}`,
											label: place.group ? `${place.section}: ${place.group}` : place.section,
											count: place.count,
										})),
										...(overview.stoppedElsewhere > 0
											? [
													{
														key: "elsewhere",
														label: t.stoppedElsewhere,
														count: overview.stoppedElsewhere,
													},
												]
											: []),
									].map((place) => (
										<li key={place.key} className="flex flex-col gap-1">
											<div className="flex items-baseline justify-between gap-3">
												<span className="min-w-0 break-words">{place.label}</span>
												<span className="shrink-0 tabular-nums">{shareOf(place.count, open)}</span>
											</div>
											<Bar share={place.count / open} />
										</li>
									))}
								</ul>
							</>
						)}
					</section>
				</>
			)}

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.exports}</h2>
				<p className="text-sm text-muted-foreground">{t.exportsLead}</p>
				<div className="flex flex-wrap gap-2">
					<a className={link} href={exportAddress("responses")} download>
						{t.exportResponses}
					</a>
					<a className={link} href={exportAddress("codebook")} download>
						{t.exportCodebook}
					</a>
				</div>
			</section>
		</>
	);
}
