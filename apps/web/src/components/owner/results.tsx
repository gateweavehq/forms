import type { QuestionSummary } from "@gateweave/forms-results";
import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { duration, percent, rounded } from "#/lib/format";
import type { ResultsFrame, ResultsSearch } from "#/lib/results";
import { strings } from "#/lib/strings";
import { Button } from "../button";

const t = strings.owner.results;
const form = getRouteApi("/forms/$form");
const select = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base";

/**
 * A bar as long as a share. It is drawn as an SVG with the length in an attribute, because the
 * pages' Content-Security-Policy allows no inline styles, and a width is one.
 */
export function Bar({ share }: { share: number }) {
	return (
		<svg
			viewBox="0 0 100 4"
			preserveAspectRatio="none"
			aria-hidden="true"
			className="h-2 w-full rounded-sm bg-muted"
		>
			<rect width={Math.max(0, Math.min(100, share * 100))} height="4" className="fill-primary" />
		</svg>
	);
}

/** A count with the share it is of what it is out of. */
export function shareOf(count: number, whole: number): string {
	return whole === 0 ? String(count) : t.share(count, percent(count / whole));
}

/**
 * What every results page begins with: which version, which responses are counted, and how
 * many that is. A number without its n says nothing, so the n is always here.
 */
export function Counted({ frame, children }: { frame: ResultsFrame; children?: ReactNode }) {
	const { versions } = form.useLoaderData();
	const search: ResultsSearch = form.useSearch();
	const navigate = form.useNavigate();
	const change = (next: Partial<ResultsSearch>) =>
		void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true });
	const filtered = search.device !== undefined || search.q !== undefined;

	return (
		<section className="flex flex-col gap-3 rounded-xl border p-4">
			<div className="grid gap-3 sm:grid-cols-3">
				{versions.length > 1 && (
					<label className="flex flex-col gap-1 text-sm font-medium">
						{t.version}
						<select
							className={select}
							value={frame.version}
							// Another version has other questions, so a filter on one does not carry over.
							onChange={(event) => change({ v: event.target.value, q: undefined, o: undefined })}
						>
							{versions.map((version) => (
								<option key={version.hash} value={version.hash}>
									{t.versionOption(version.hash, version.started, version.current)}
								</option>
							))}
						</select>
					</label>
				)}
				<label className="flex flex-col gap-1 text-sm font-medium">
					{t.device}
					<select
						className={select}
						value={search.device ?? ""}
						onChange={(event) => {
							const device = event.target.value;
							change({
								device:
									device === "phone" || device === "tablet" || device === "desk"
										? device
										: undefined,
							});
						}}
					>
						<option value="">{t.allDevices}</option>
						<option value="phone">{t.devices.phone}</option>
						<option value="tablet">{t.devices.tablet}</option>
						<option value="desk">{t.devices.desk}</option>
					</select>
				</label>
				{frame.filters.length > 0 && (
					<label className="flex flex-col gap-1 text-sm font-medium">
						{t.answer}
						<select
							className={select}
							value={search.q && search.o ? `${search.q} ${search.o}` : ""}
							onChange={(event) => {
								// Ids hold no space, so one separates the question from the option.
								const [q, o] = event.target.value.split(" ");
								change(q && o ? { q, o } : { q: undefined, o: undefined });
							}}
						>
							<option value="">{t.anyAnswer}</option>
							{frame.filters.map((question) => (
								<optgroup key={question.id} label={question.label}>
									{question.options.map((option) => (
										<option key={option.id} value={`${question.id} ${option.id}`}>
											{option.label}
										</option>
									))}
								</optgroup>
							))}
						</select>
					</label>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<p className="font-medium" data-testid="counted">
					{t.counted(frame.counted, frame.all)}
				</p>
				{filtered && (
					<Button
						variant="outline"
						onClick={() => change({ device: undefined, q: undefined, o: undefined })}
					>
						{t.clear}
					</Button>
				)}
			</div>
			{children}
		</section>
	);
}

/** Said in place of the numbers when there is nothing to count. */
export function Nothing({ frame }: { frame: ResultsFrame }) {
	return <p className="text-muted-foreground">{frame.all === 0 ? t.none : t.noneCounted}</p>;
}

function Texts({ texts }: { texts: string[] }) {
	if (texts.length === 0) return <p className="text-sm text-muted-foreground">{t.noAnswers}</p>;
	return (
		<details>
			<summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">
				{t.texts(texts.length)}
			</summary>
			<ul className="flex flex-col gap-2 pt-1">
				{texts.map((text, index) => (
					// Two people can write the same thing, so the text alone is no key.
					// biome-ignore lint/suspicious/noArrayIndexKey: the list is never reordered
					<li key={index} className="rounded-md bg-muted px-3 py-2 text-sm break-words">
						{text}
					</li>
				))}
			</ul>
		</details>
	);
}

/** One question's answers, added up: every share is out of the people who answered it. */
export function QuestionCard({ summary }: { summary: QuestionSummary }) {
	const { tally, answered } = summary;
	return (
		<article className="flex flex-col gap-3 rounded-xl border p-4" data-question={summary.id}>
			<header className="flex flex-col gap-1">
				<h3 className="font-medium break-words">{summary.label}</h3>
				<p className="text-sm text-muted-foreground">
					{t.seen(summary.answered, summary.seen)}
					{summary.medianMs !== null && ` · ${t.median(duration(summary.medianMs))}`}
					{summary.changes > 0 && ` · ${t.changes(summary.changes)}`}
				</p>
			</header>
			{tally.kind === "options" && (
				<ul className="flex flex-col gap-2">
					{tally.options.map((option) => (
						<li key={option.id} className="flex flex-col gap-1" data-option={option.id}>
							<div className="flex items-baseline justify-between gap-3">
								<span className="min-w-0 break-words">{option.label}</span>
								<span className="shrink-0 tabular-nums">{shareOf(option.count, answered)}</span>
							</div>
							<Bar share={answered === 0 ? 0 : option.count / answered} />
							{option.texts.length > 0 && (
								<div className="pl-3">
									<p className="text-sm text-muted-foreground">{t.written}</p>
									<Texts texts={option.texts} />
								</div>
							)}
						</li>
					))}
				</ul>
			)}
			{tally.kind === "number" &&
				(tally.median === null ? (
					<p className="text-sm text-muted-foreground">{t.noAnswers}</p>
				) : (
					<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{(["median", "mean", "min", "max"] as const).map((key) => (
							<div key={key}>
								<dt className="text-sm text-muted-foreground">{t.number[key]}</dt>
								<dd className="text-lg font-medium tabular-nums">{rounded(tally[key] ?? 0)}</dd>
							</div>
						))}
					</dl>
				))}
			{tally.kind === "texts" && <Texts texts={tally.texts} />}
			{tally.kind === "ranking" && (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="py-1.5 pr-3 font-medium">{t.ranking.option}</th>
								<th className="py-1.5 pr-3 font-medium">{t.ranking.meanPlace}</th>
								<th className="py-1.5 pr-3 font-medium">{t.ranking.first}</th>
								<th className="py-1.5 font-medium">{t.ranking.ranked}</th>
							</tr>
						</thead>
						<tbody>
							{tally.options.map((option) => (
								<tr key={option.id} className="border-t">
									<th className="py-1.5 pr-3 font-normal break-words">{option.label}</th>
									<td className="py-1.5 pr-3 tabular-nums">
										{option.meanPlace === null ? "" : rounded(option.meanPlace)}
									</td>
									<td className="py-1.5 pr-3 tabular-nums">{option.first}</td>
									<td className="py-1.5 tabular-nums">{option.ranked}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{tally.kind === "grid" && (
				<ul className="flex flex-col gap-3">
					{tally.rows.map((row) => {
						const given = row.columns.reduce((sum, column) => sum + column.count, 0);
						return (
							<li key={row.id} className="flex flex-col gap-1">
								<p className="font-medium break-words">{row.label}</p>
								<ul className="flex flex-col gap-1 text-sm">
									{row.columns.map((column) => (
										<li key={column.id} className="flex items-baseline justify-between gap-3">
											<span className="min-w-0 break-words">{column.label}</span>
											<span className="shrink-0 tabular-nums">{shareOf(column.count, given)}</span>
										</li>
									))}
								</ul>
							</li>
						);
					})}
				</ul>
			)}
			{tally.kind === "fields" && (
				<ul className="flex flex-col gap-2">
					{tally.fields.map((field) => (
						<li key={field.id}>
							<p className="font-medium break-words">{field.label}</p>
							<Texts texts={field.texts} />
						</li>
					))}
				</ul>
			)}
		</article>
	);
}
