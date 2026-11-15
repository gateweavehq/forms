import type { ItemSummary, RepeatTable } from "@gateweave/forms-results";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Bar, Counted, Nothing, QuestionCard, shareOf } from "#/components/owner/results";
import { getResults, type ResultsOf } from "#/lib/results";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/items")({
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }): Promise<ResultsOf<"items">> => {
		const results = await getResults({ data: { form: params.form, view: "items", ...deps } });
		if (results?.view !== "items") throw notFound();
		return results;
	},
	component: ItemsPage,
});

const t = strings.owner.results;

/** The options of an item's first status question, which is what the table's columns are. */
function statusOf(item: ItemSummary) {
	const [first] = item.status;
	return first?.tally.kind === "options" ? { ...first, options: first.tally.options } : undefined;
}

function ItemsPage() {
	const { frame, tables } = Route.useLoaderData();
	return (
		<>
			<Counted frame={frame} />
			{frame.counted === 0 && <Nothing frame={frame} />}
			{tables.length === 0 && <p className="text-muted-foreground">{t.noItems}</p>}
			{frame.counted > 0 && tables.map((table) => <Table key={table.id} table={table} />)}
		</>
	);
}

function Table({ table }: { table: RepeatTable }) {
	const columns = statusOf(
		table.groups[0]?.items[0] ?? { id: "", label: "", status: [], followUps: [] },
	);
	const items = table.groups.flatMap((group) => group.items);
	// Everything but the first status question as a table's cell: each needs room for its own
	// kind of answer, and most were shown to few.
	const more = items.flatMap((item) =>
		[...(columns ? item.status.slice(1) : item.status), ...item.followUps]
			.filter((question) => question.answered > 0)
			.map((question) => ({ item, question })),
	);

	return (
		<section className="flex flex-col gap-4" data-section={table.id}>
			<h2 className="text-lg font-semibold break-words">{table.title}</h2>
			{columns &&
				table.groups.map((group) => (
					<div key={group.id} className="flex flex-col gap-2">
						<h3 className="font-medium break-words">{group.title}</h3>

						{/* A desk has room for the statuses side by side. */}
						<div className="hidden overflow-x-auto rounded-xl border md:block">
							<table className="w-full text-left text-sm">
								<thead className="bg-muted text-muted-foreground">
									<tr>
										<th scope="col" className="px-3 py-2 font-medium">
											{t.item}
										</th>
										<th scope="col" className="px-3 py-2 font-medium">
											{t.itemAnswered}
										</th>
										{columns.options.map((option) => (
											<th key={option.id} scope="col" className="px-3 py-2 font-medium">
												{option.label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{group.items.map((item) => {
										const status = statusOf(item);
										return (
											<tr key={item.id} className="border-t align-top" data-item={item.id}>
												<th scope="row" className="px-3 py-2 font-medium break-words">
													{item.label}
												</th>
												<td className="px-3 py-2 tabular-nums">{status?.answered ?? 0}</td>
												{status?.options.map((option) => (
													<td key={option.id} className="px-3 py-2" data-option={option.id}>
														<span className="tabular-nums">
															{shareOf(option.count, status.answered)}
														</span>
														<Bar
															share={status.answered === 0 ? 0 : option.count / status.answered}
														/>
													</td>
												))}
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>

						{/* A phone does not: each item is its own short list. */}
						<ul className="flex flex-col gap-2 md:hidden">
							{group.items.map((item) => {
								const status = statusOf(item);
								return (
									<li key={item.id} className="flex flex-col gap-2 rounded-xl border p-3">
										<div className="flex items-baseline justify-between gap-3">
											<span className="min-w-0 font-medium break-words">{item.label}</span>
											<span className="shrink-0 text-sm text-muted-foreground">
												{t.itemAnswered}: {status?.answered ?? 0}
											</span>
										</div>
										<ul className="flex flex-col gap-1.5 text-sm">
											{status?.options.map((option) => (
												<li key={option.id} className="flex flex-col gap-0.5">
													<div className="flex items-baseline justify-between gap-3">
														<span className="min-w-0 break-words">{option.label}</span>
														<span className="shrink-0 tabular-nums">
															{shareOf(option.count, status.answered)}
														</span>
													</div>
													<Bar share={status.answered === 0 ? 0 : option.count / status.answered} />
												</li>
											))}
										</ul>
									</li>
								);
							})}
						</ul>
					</div>
				))}

			<div className="flex flex-col gap-2">
				<h3 className="font-medium">{t.followUps}</h3>
				<p className="text-sm text-muted-foreground">{t.followUpsLead}</p>
				{more.length === 0 && <p className="text-muted-foreground">{t.noFollowUps}</p>}
				{items.map((item) => {
					const own = more.filter((entry) => entry.item.id === item.id);
					if (own.length === 0) return null;
					const answers = own.reduce((sum, { question }) => sum + question.answered, 0);
					return (
						<details key={item.id} className="rounded-xl border px-4" data-follow-ups={item.id}>
							<summary className="min-h-11 cursor-pointer py-2.5 font-medium break-words">
								{t.followUpsOf(item.label, answers)}
							</summary>
							<div className="flex flex-col gap-3 pb-4">
								{own.map(({ question }) => (
									<QuestionCard key={question.id} summary={question} />
								))}
							</div>
						</details>
					);
				})}
			</div>
		</section>
	);
}
