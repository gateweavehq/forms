import { createFileRoute, notFound } from "@tanstack/react-router";
import { getDetached } from "#/lib/results";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/detached")({
	loader: async ({ params }) => {
		const detached = await getDetached({ data: params.form });
		if (!detached) throw notFound();
		return detached;
	},
	component: DetachedPage,
});

const t = strings.owner.results;

function DetachedPage() {
	const detached = Route.useLoaderData();
	const { form } = Route.useParams();
	if (detached.state !== "shown") {
		return (
			<>
				<p className="text-muted-foreground">{t.detachedLead}</p>
				<p role="status" className="rounded-xl border p-4 font-medium">
					{detached.state === "open" ? t.detachedOpen : t.detachedFew(detached.needed)}
				</p>
			</>
		);
	}
	const { questions, rows } = detached;
	return (
		<>
			<p className="text-muted-foreground">{t.detachedLead}</p>
			<div className="flex flex-wrap items-center gap-3">
				<p className="font-medium">{t.detachedCount(rows.length)}</p>
				<a
					className="inline-flex min-h-11 items-center rounded-md border border-input bg-background px-4 font-medium hover:bg-accent"
					href={`/api/owner/forms/${encodeURIComponent(form)}/export/detached.csv`}
					download
				>
					{t.exportDetached}
				</a>
			</div>
			<div className="overflow-x-auto rounded-xl border">
				<table className="w-full text-left text-sm">
					<thead className="bg-muted text-muted-foreground">
						<tr>
							{questions.map((question) => (
								<th key={question.id} scope="col" className="px-3 py-2 font-medium">
									{question.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row, index) => (
							// The rows have nothing of their own to be told apart by, which is the point.
							// biome-ignore lint/suspicious/noArrayIndexKey: the list is never reordered
							<tr key={index} className="border-t">
								{row.map((value, column) => (
									<td key={questions[column]?.id} className="px-3 py-2 break-words">
										{value}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
