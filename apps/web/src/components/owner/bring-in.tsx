import { type ChangeEvent, useId, useState } from "react";
import { OwnerRefused, owner } from "#/lib/owner-client";
import { strings } from "#/lib/strings";
import type { Preview } from "#/server/owner";
import { Button } from "../button";
import { LiveButton } from "../live-button";

const t = strings.owner.bringIn;
const field =
	"w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground";

type Kind = "definition" | "tally";

/** What a refusal says to the person: the server's words, or a line about the connection. */
export function refusalText(error: unknown): { message: string; problems: string[] } {
	if (error instanceof OwnerRefused && error.message) {
		return { message: error.message, problems: error.problems };
	}
	return { message: strings.owner.failed, problems: [] };
}

/**
 * Brings a form in without a builder: paste or upload a definition, or the JSON of a Tally
 * form's page. Nothing is stored until the person has seen what it would become (its outline,
 * and for a Tally page everything the importer folded, left out or could not fold) and accepts.
 */
export function BringIn({
	acceptLabel,
	onAccept,
}: {
	acceptLabel: string;
	/** Stores the definition. Throws `OwnerRefused` when the server will not take it. */
	onAccept: (definition: unknown) => Promise<void>;
}) {
	const id = useId();
	const [kind, setKind] = useState<Kind>("definition");
	const [text, setText] = useState("");
	const [fileName, setFileName] = useState<string>();
	const [acceptDifferences, setAcceptDifferences] = useState(false);
	const [detachEmail, setDetachEmail] = useState(false);
	const [formId, setFormId] = useState("");
	const [result, setResult] = useState<Preview>();
	const [failure, setFailure] = useState<{ message: string; problems: string[] }>();
	const [busy, setBusy] = useState(false);

	const reset = () => {
		setResult(undefined);
		setFailure(undefined);
	};

	const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const [file] = event.target.files ?? [];
		if (!file) return;
		setText(await file.text());
		setFileName(file.name);
		reset();
	};

	const check = async () => {
		setBusy(true);
		reset();
		try {
			const body = {
				kind,
				text,
				...(kind === "tally"
					? { acceptDifferences, detachEmail, ...(formId.trim() ? { id: formId.trim() } : {}) }
					: {}),
			};
			setResult((await owner("POST", "preview", body)) as Preview);
		} catch (error) {
			setFailure(refusalText(error));
		}
		setBusy(false);
	};

	const accept = async () => {
		if (!result?.ok) return;
		setBusy(true);
		setFailure(undefined);
		try {
			await onAccept(result.definition);
		} catch (error) {
			setFailure(refusalText(error));
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-5">
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 font-medium">{t.what}</legend>
				{(["definition", "tally"] as const).map((option) => (
					<label key={option} className="flex min-h-11 cursor-pointer items-center gap-3">
						<input
							type="radio"
							name={`${id}-kind`}
							className="size-5 accent-foreground"
							checked={kind === option}
							onChange={() => {
								setKind(option);
								reset();
							}}
						/>
						{option === "definition" ? t.definition : t.tally}
					</label>
				))}
			</fieldset>
			<p className="text-sm text-muted-foreground">
				{kind === "definition" ? t.definitionHelp : t.tallyHelp}
			</p>
			<label className="flex flex-col gap-1.5 font-medium">
				{t.file}
				<input
					type="file"
					accept=".json,.html,application/json,text/html"
					className="min-h-11 text-base font-normal file:mr-3 file:min-h-11 file:rounded-md file:border file:border-input file:bg-background file:px-3"
					onChange={(event) => void onFile(event)}
				/>
			</label>
			{/* A file's text is kept out of the box: a megabyte of JSON in a textarea stalls a phone. */}
			{fileName ? (
				<p className="flex flex-wrap items-center gap-3">
					{t.fromFile(fileName, text.length)}
					<Button
						variant="outline"
						onClick={() => {
							setFileName(undefined);
							setText("");
							reset();
						}}
					>
						{t.clearFile}
					</Button>
				</p>
			) : (
				<label className="flex flex-col gap-1.5 font-medium">
					{t.paste}
					<textarea
						rows={8}
						spellCheck={false}
						className={`${field} font-mono text-sm font-normal`}
						value={text}
						onChange={(event) => {
							setText(event.target.value);
							reset();
						}}
					/>
				</label>
			)}
			{kind === "tally" && (
				<div className="flex flex-col gap-2">
					<label className="flex min-h-11 cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							className="size-5 shrink-0 accent-foreground"
							checked={acceptDifferences}
							onChange={(event) => {
								setAcceptDifferences(event.target.checked);
								reset();
							}}
						/>
						{t.acceptDifferences}
					</label>
					<label className="flex min-h-11 cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							className="size-5 shrink-0 accent-foreground"
							checked={detachEmail}
							onChange={(event) => {
								setDetachEmail(event.target.checked);
								reset();
							}}
						/>
						{t.detachEmail}
					</label>
					<label className="flex flex-col gap-1.5 font-medium">
						{t.id}
						<input
							className={`${field} min-h-11`}
							value={formId}
							placeholder={t.idPlaceholder}
							onChange={(event) => {
								setFormId(event.target.value);
								reset();
							}}
						/>
					</label>
				</div>
			)}
			<LiveButton
				variant={result?.ok ? "outline" : "primary"}
				className="self-start"
				disabled={busy || text.trim() === ""}
				onClick={() => void check()}
			>
				{t.check}
			</LiveButton>

			{failure && <Problems title={failure.message} problems={failure.problems} />}
			{result && !result.ok && <Problems title={t.notValid} problems={result.problems} />}
			{result?.ok && (
				<section aria-label={t.outline} className="flex flex-col gap-4 rounded-xl border p-4">
					<Outline result={result} />
					<LiveButton className="self-start" disabled={busy} onClick={() => void accept()}>
						{acceptLabel}
					</LiveButton>
				</section>
			)}
		</div>
	);
}

function Problems({ title, problems }: { title: string; problems: string[] }) {
	return (
		<div role="alert" className="flex flex-col gap-2 rounded-xl border border-destructive p-4">
			<p className="font-medium">{title}</p>
			{problems.length > 0 && (
				<ul className="flex list-disc flex-col gap-1 pl-5 text-sm break-words">
					{problems.map((problem) => (
						<li key={problem}>{problem}</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** What the text would become, and for a Tally page what the importer did on the way. */
function Outline({ result }: { result: Extract<Preview, { ok: true }> }) {
	const { summary, report } = result;
	return (
		<>
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold break-words">{summary.title}</h2>
				<p className="text-sm text-muted-foreground">
					{t.address(summary.id)} · {summary.hasConsent ? t.withConsent : t.withoutConsent}
				</p>
			</div>
			<ol className="flex list-decimal flex-col gap-1 pl-5">
				{summary.sections.map((section) => (
					<li key={section.title} className="break-words">
						{section.title}:{" "}
						{section.type === "questions"
							? t.questions(section.questions)
							: t.repeat(
									section.groups.map((group) => group.items),
									section.questions,
								)}
					</li>
				))}
			</ol>
			{report && (
				<div className="flex flex-col gap-3 text-sm">
					<p>{t.source(report.source.pages, report.source.blocks, report.source.rules)}</p>
					{report.folded.map((fold) => (
						<div key={fold.section}>
							<p className="font-medium">{t.folded(fold.pages, fold.items)}</p>
							{fold.settled.length > 0 && (
								<>
									<p>{t.settled(fold.settled.length)}</p>
									<Differences list={fold.settled} />
								</>
							)}
						</div>
					))}
					{report.refused.map((refusal) => (
						<div key={refusal.pages.join()} className="rounded-md border border-destructive p-3">
							<p className="font-medium">{t.notFolded(refusal.pages, refusal.items)}</p>
							{refusal.reason && <p>{refusal.reason}</p>}
							<Differences list={refusal.differences} />
							{!refusal.reason && <p>{t.notFoldedHelp}</p>}
						</div>
					))}
					{report.notes.length > 0 && (
						<div>
							<p className="font-medium">{t.notes}</p>
							<ul className="flex list-disc flex-col gap-1 pl-5 break-words">
								{report.notes.map((note) => (
									<li key={note}>{note}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}
		</>
	);
}

function Differences({
	list,
}: {
	list: Array<{ item: string; where: string; found: string; expected: string }>;
}) {
	return (
		<ul className="flex list-disc flex-col gap-1 pl-5 break-words">
			{list.map((difference) => (
				<li key={`${difference.item} ${difference.where}`}>
					{t.difference(difference.item, difference.where, difference.found, difference.expected)}
				</li>
			))}
		</ul>
	);
}
