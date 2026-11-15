import {
	type AnswerValue,
	type Definition,
	detachedQuestions,
	detachedQuestionsShown,
	withdrawalOf,
} from "@gateweave/forms-schema";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { RequestFailed, sendDetached, withdrawResponse } from "#/lib/client";
import { type Draft, fromDraft, toDraft } from "#/lib/draft";
import { forgetResponse } from "#/lib/local";
import { strings } from "#/lib/strings";
import { Contact, storedAddress } from "./about-form";
import { Button } from "./button";
import { QuestionInput } from "./inputs";
import { RichTextView } from "./rich-text";
import { consentAddress } from "./your-answers";

/**
 * What a person sees once their response is complete: the form's thanks, and the questions
 * whose answers are kept apart. Those are asked here, after the response is closed, and sent in
 * a request that names no response, so that nothing on the way can tie the two together.
 *
 * They are asked once, right after finishing. The server cannot say whether a response already
 * sent them (the response would then say so), so a finished response opened again shows the thanks alone.
 */
export function EndPage({
	definition,
	askDetached,
	children,
	footer,
	version,
	responseId,
	secret,
	canWithdraw,
	onWithdrawn,
}: {
	definition: Definition;
	/** Whether the person finished just now, in this page. */
	askDetached: boolean;
	/** What follows the thanks and the detached questions: the person's own answers to look over. */
	children?: ReactNode;
	/** What closes the page, under everything a person can still do about their answers. */
	footer?: ReactNode;
	/** Names the wording the response began under, for the copy of its consent. */
	version: string;
	responseId: string;
	secret: string;
	/** Whether the server said it would take the answers back if asked. */
	canWithdraw: boolean;
	onWithdrawn: () => void;
}) {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		window.scrollTo(0, 0);
		heading.current?.focus({ preventScroll: true });
	}, []);
	const hasDetached = askDetached && detachedQuestions(definition).length > 0;
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
			<h1
				ref={heading}
				tabIndex={-1}
				className="text-2xl font-semibold tracking-tight text-balance outline-none"
			>
				{definition.end?.title ?? strings.end.title}
			</h1>
			{definition.end?.text ? (
				<RichTextView text={definition.end.text} />
			) : (
				<p>{strings.end.body}</p>
			)}
			{hasDetached && <DetachedForm definition={definition} />}
			{children}
			<TakeBack
				definition={definition}
				responseId={responseId}
				secret={secret}
				canWithdraw={canWithdraw}
				onWithdrawn={onWithdrawn}
			/>
			<div className="flex flex-col">
				{definition.consent && (
					<a
						href={consentAddress(definition.id, version)}
						target="_blank"
						rel="noopener"
						className={quietLink}
					>
						{strings.yours.consentCopy}
					</a>
				)}
				<a
					href={storedAddress(definition.id, version)}
					target="_blank"
					rel="noopener"
					className={quietLink}
				>
					{strings.about.stored}
				</a>
			</div>
			{footer}
		</main>
	);
}

const quietLink =
	"inline-flex min-h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4";

/**
 * What a person can still do about answers they have finished giving: take them back, while
 * the form's rule and its state allow it, or else whom to ask. Which of the two it is comes
 * from the server, and the server decides again when the button is pressed.
 *
 * Anyone who opens the response's address sees this, on any device: the address is what allows
 * it, as it is what shows the answers.
 */
function TakeBack({
	definition,
	responseId,
	secret,
	canWithdraw,
	onWithdrawn,
}: {
	definition: Definition;
	responseId: string;
	secret: string;
	canWithdraw: boolean;
	onWithdrawn: () => void;
}) {
	const t = strings.end.takeBack;
	const [asking, setAsking] = useState(false);
	const [state, setState] = useState<"idle" | "sending" | "failed" | "refused">("idle");
	const { controller } = definition;

	const withdraw = async () => {
		setState("sending");
		try {
			await withdrawResponse(responseId, secret);
			forgetResponse(definition.id);
			onWithdrawn();
		} catch (error) {
			const status = error instanceof RequestFailed ? error.status : 0;
			// The server would not: trying again would not change that, so it is not offered.
			setState(status === 404 || status === 409 ? "refused" : "failed");
		}
	};

	const possible = canWithdraw && state !== "refused";
	return (
		<section className="flex flex-col gap-3 rounded-xl border p-4">
			<h2 className="text-lg font-semibold">{t.title}</h2>
			<p className="text-sm text-muted-foreground">
				{possible
					? t.can
					: state === "refused"
						? t.refused
						: withdrawalOf(definition) === "until-complete"
							? t.never
							: t.closed}
			</p>
			{controller && (
				<p className="text-sm break-words">
					{strings.about.runBy} <span className="font-medium">{controller.name}</span>
					{" · "}
					<Contact contact={controller.contact} />
				</p>
			)}
			{possible &&
				(asking ? (
					<div className="flex flex-col gap-3">
						<p className="font-medium">{t.sure}</p>
						{detachedQuestions(definition).length > 0 && (
							<p className="text-sm">{t.sureDetached}</p>
						)}
						<div className="flex flex-wrap gap-2">
							<Button
								className="bg-destructive text-white hover:bg-destructive/90"
								disabled={state === "sending"}
								onClick={() => void withdraw()}
							>
								{t.confirm}
							</Button>
							<Button variant="outline" onClick={() => setAsking(false)}>
								{strings.owner.cancel}
							</Button>
						</div>
					</div>
				) : (
					<Button variant="outline" className="self-start" onClick={() => setAsking(true)}>
						{t.ask}
					</Button>
				))}
			{state === "failed" && (
				<p role="alert" className="font-medium text-destructive">
					{t.failed}
				</p>
			)}
		</section>
	);
}

function DetachedForm({ definition }: { definition: Definition }) {
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [problems, setProblems] = useState<Record<string, string>>({});
	const [state, setState] = useState<"open" | "sending" | "failed" | "busy" | "sent" | "closed">(
		"open",
	);
	const id = useId();

	const values: Record<string, AnswerValue | null> = {};
	for (const question of detachedQuestions(definition)) {
		const checked = fromDraft(question, drafts[question.id] ?? toDraft(null));
		values[question.id] = checked.ok ? checked.value : null;
	}
	const shown = detachedQuestionsShown(definition, values);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const found: Record<string, string> = {};
		const answers: Record<string, AnswerValue> = {};
		for (const question of shown) {
			const checked = fromDraft(question, drafts[question.id] ?? toDraft(null));
			if (!checked.ok) found[question.id] = checked.problem;
			else if (checked.value !== null) answers[question.id] = checked.value;
		}
		setProblems(found);
		if (Object.keys(found).length > 0) return;
		// Nothing entered is an answer too: there is nothing to keep, and nothing is sent.
		if (Object.keys(answers).length === 0) {
			setState("sent");
			return;
		}
		setState("sending");
		try {
			await sendDetached(definition.id, answers);
			setState("sent");
		} catch (error) {
			const status = error instanceof RequestFailed ? error.status : 0;
			// The form was closed after this person finished. Their response is stored; this
			// part is not, and trying again would not change that, so it is said and not offered.
			setState(status === 404 ? "closed" : status === 429 ? "busy" : "failed");
		}
	};

	if (state === "sent" || state === "closed") {
		return (
			<p role="status" className="rounded-lg border px-4 py-3 font-medium">
				{state === "sent" ? strings.end.sent : strings.end.detachedClosed}
			</p>
		);
	}

	return (
		<form className="flex flex-col gap-5 rounded-xl border p-4" onSubmit={submit} noValidate>
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold">{strings.end.detachedTitle}</h2>
				<p className="text-sm text-muted-foreground">{strings.end.detachedBody}</p>
			</div>
			{shown.map((question) => {
				const labelId = `${id}-${question.id}`;
				const problemId = `${id}-${question.id}-problem`;
				const problem = problems[question.id];
				return (
					<div key={question.id} className="flex flex-col gap-2">
						<p id={labelId} className="text-base font-medium">
							{question.label}
						</p>
						{question.description && (
							<RichTextView text={question.description} className="text-sm text-muted-foreground" />
						)}
						<QuestionInput
							question={question}
							draft={drafts[question.id] ?? toDraft(null)}
							onDraft={(draft) => {
								setDrafts((current) => ({ ...current, [question.id]: draft }));
								setProblems(({ [question.id]: _fixed, ...rest }) => rest);
							}}
							labelledBy={labelId}
							problemId={problem ? problemId : undefined}
						/>
						{problem && (
							<p id={problemId} role="alert" className="font-medium text-destructive">
								{problem}
							</p>
						)}
					</div>
				);
			})}
			{(state === "failed" || state === "busy") && (
				<p role="alert" className="font-medium text-destructive">
					{state === "busy" ? strings.end.sendBusy : strings.end.sendFailed}
				</p>
			)}
			<Button type="submit" className="self-start" disabled={state === "sending"}>
				{strings.end.send}
			</Button>
		</form>
	);
}
