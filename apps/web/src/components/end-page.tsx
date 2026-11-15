import {
	type AnswerValue,
	type Definition,
	detachedQuestions,
	detachedQuestionsShown,
} from "@gateweave/forms-schema";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { RequestFailed, sendDetached } from "#/lib/client";
import { type Draft, fromDraft, toDraft } from "#/lib/draft";
import { strings } from "#/lib/strings";
import { Button } from "./button";
import { QuestionInput } from "./inputs";
import { RichTextView } from "./rich-text";

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
}: {
	definition: Definition;
	/** Whether the person finished just now, in this page. */
	askDetached: boolean;
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
		</main>
	);
}

function DetachedForm({ definition }: { definition: Definition }) {
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [problems, setProblems] = useState<Record<string, string>>({});
	const [state, setState] = useState<"open" | "sending" | "failed" | "busy" | "sent">("open");
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
			setState(error instanceof RequestFailed && error.status === 429 ? "busy" : "failed");
		}
	};

	if (state === "sent") {
		return (
			<p role="status" className="rounded-lg border px-4 py-3 font-medium">
				{strings.end.sent}
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
