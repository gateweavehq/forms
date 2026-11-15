import {
	type AnswerValue,
	type Definition,
	flow,
	getAnswer,
	isAsking,
	itemOf,
	placesOf,
	type ResponseAnswers,
	type Step,
	withAnswer,
} from "@gateweave/forms-schema";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActiveClock } from "#/lib/active-clock";
import {
	completeResponse,
	loadResponse,
	type Progress,
	type ResponseState,
	sendProgress,
} from "#/lib/client";
import {
	autoAdvancePreferred,
	forgetResponse,
	preferAutoAdvance,
	rememberedResponse,
	rememberResponse,
} from "#/lib/local";
import { SaveQueue } from "#/lib/save-queue";
import { strings } from "#/lib/strings";
import { Button } from "./button";
import { AskingCard, type Direction, FollowUpsIntroCard, type Mover, SectionCard } from "./cards";
import { ContinueElsewhere } from "./continue-elsewhere";
import { EndPage } from "./end-page";
import { Notice } from "./notice";

type Opened =
	| { state: "loading" }
	| { state: "no-secret" }
	| { state: "not-found" }
	| { state: "failed" }
	| { state: "open"; secret: string; response: ResponseState };

/**
 * A response's page. The secret that opens it is the part of the address after the `#`, which
 * a browser never sends anywhere, so it is read here and presented in a header.
 */
export function Runner({ definition, responseId }: { definition: Definition; responseId: string }) {
	const [opened, setOpened] = useState<Opened>({ state: "loading" });
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is what "Try again" changes
	useEffect(() => {
		let current = true;
		const remembered = rememberedResponse(definition.id);
		const secret =
			window.location.hash.slice(1) ||
			// The address lost its end, but this browser is the one that started the response.
			(remembered?.id === responseId ? remembered.secret : "");
		if (!secret) {
			setOpened({ state: "no-secret" });
			return;
		}
		setOpened({ state: "loading" });
		loadResponse(responseId, secret).then(
			(response) => {
				if (!current) return;
				if (!response || response.form !== definition.id) {
					setOpened({ state: "not-found" });
					return;
				}
				// So that the form's bare link offers these answers again on this device.
				if (!response.completed) rememberResponse(definition.id, { id: responseId, secret });
				setOpened({ state: "open", secret, response });
			},
			() => {
				if (current) setOpened({ state: "failed" });
			},
		);
		return () => {
			current = false;
		};
	}, [definition.id, responseId, attempt]);

	const startAgain = (
		<Link
			to="/f/$form"
			params={{ form: definition.id }}
			className="font-medium underline underline-offset-4"
		>
			{strings.response.startAgain}
		</Link>
	);

	switch (opened.state) {
		case "loading":
			return (
				<p role="status" className="px-4 py-10 text-center text-muted-foreground">
					{strings.response.loading}
				</p>
			);
		case "no-secret":
			return (
				<Notice title={strings.response.missingTitle} action={startAgain}>
					{strings.response.missingBody}
				</Notice>
			);
		case "not-found":
			return (
				<Notice title={strings.response.notFoundTitle} action={startAgain}>
					{strings.response.notFoundBody}
				</Notice>
			);
		case "failed":
			return (
				<Notice
					title={strings.error.title}
					action={
						<Button variant="outline" onClick={() => setAttempt((count) => count + 1)}>
							{strings.error.retry}
						</Button>
					}
				>
					{strings.error.body}
				</Notice>
			);
		case "open":
			return (
				<Answering
					// A response goes on under the definition it started with, whatever the form
					// says today: its answers were given to those questions.
					definition={opened.response.definition ?? definition}
					responseId={responseId}
					secret={opened.secret}
					initial={opened.response}
				/>
			);
	}
}

/** In a few words, where a step is: what a screen reader hears when a card moved on by itself. */
function whereIs(definition: Definition, step: Step): string {
	const places = placesOf(definition);
	if (step.kind === "section" || step.kind === "question") {
		const section = definition.sections.find((candidate) => candidate.id === step.sectionId);
		return section?.title ?? "";
	}
	if (step.kind === "followUpsIntro") return strings.position.followUp(1, 1);
	const place = places.items.get(step.itemId);
	if (!place) return "";
	const within =
		step.kind === "status"
			? strings.position.item(step.item, step.items)
			: strings.position.followUp(step.item, step.items);
	return `${place.item.label}, ${within}`;
}

function Answering({
	definition,
	responseId,
	secret,
	initial,
}: {
	definition: Definition;
	responseId: string;
	secret: string;
	initial: ResponseState;
}) {
	const places = useMemo(() => placesOf(definition), [definition]);
	const [answers, setAnswers] = useState<ResponseAnswers>(initial.answers);
	const [position, setPosition] = useState<string | undefined>(initial.position ?? undefined);
	const [completed, setCompleted] = useState(initial.completed);
	const [finishing, setFinishing] = useState<"no" | "sending" | "failed">("no");
	const [failing, setFailing] = useState(false);
	const [refused, setRefused] = useState(false);
	const [announcement, setAnnouncement] = useState("");
	const [autoAdvance, setAutoAdvance] = useState(true);

	const queue = useRef<SaveQueue | undefined>(undefined);
	if (!queue.current) {
		queue.current = new SaveQueue(
			(progress) => sendProgress(responseId, secret, progress),
			setFailing,
			// Only an answer the server would not take is the person's business. A refused note
			// of where they are costs them nothing.
			(progress) => {
				if (progress.answer) setRefused(true);
			},
		);
	}
	const clock = useRef<ActiveClock | undefined>(undefined);

	useEffect(() => {
		setAutoAdvance(autoAdvancePreferred());
		const active = new ActiveClock(document.visibilityState === "visible");
		clock.current = active;
		const onVisibility = () => active.setVisible(document.visibilityState === "visible");
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			queue.current?.stop();
		};
	}, []);

	const steps = useMemo(() => flow(definition, answers), [definition, answers]);
	// A position the form no longer has (it was edited since) starts over at the top.
	const index = Math.max(
		0,
		steps.findIndex((step) => step.key === position),
	);
	const step = steps[index];

	const finish = useCallback(async () => {
		setFinishing("sending");
		try {
			// Every answer first: completing is refused while a required one has not arrived.
			await queue.current?.settled();
			await completeResponse(responseId, secret);
			forgetResponse(definition.id);
			setCompleted(true);
		} catch {
			setFinishing("failed");
		}
	}, [definition.id, responseId, secret]);

	const chooseAutoAdvance = (on: boolean) => {
		setAutoAdvance(on);
		preferAutoAdvance(on);
	};

	if (completed) return <EndPage definition={definition} askDetached={!initial.completed} />;
	if (!step) return null;

	/** Leaves the current step: stores its answer, if it has one, and moves. */
	const leave = (direction: Direction, value?: AnswerValue | null, mover: Mover = "person") => {
		const progress: Progress = {};
		let nextAnswers = answers;
		if (isAsking(step) && value !== undefined) {
			const item = itemOf(step);
			const activeMs = clock.current?.take() ?? 0;
			progress.answer = {
				question: step.questionId,
				...(item === undefined ? {} : { item }),
				value,
				activeMs,
			};
			// A copy for this page only. What counts as a change is the server's to say.
			const before = getAnswer(answers, step.questionId, item);
			nextAnswers = withAnswer(answers, step.questionId, item, {
				value,
				activeMs: (before?.activeMs ?? 0) + activeMs,
				changes: before?.changes ?? 0,
			});
		} else {
			// Time on a card that asks nothing belongs to no answer.
			clock.current?.take();
		}

		// The answer just given may open or close steps after this one, never before it.
		const nextSteps = flow(definition, nextAnswers);
		const here = nextSteps.findIndex((candidate) => candidate.key === step.key);
		const target = nextSteps[here + (direction === "next" ? 1 : -1)];
		if (target) progress.position = target.key;
		if (progress.answer || progress.position) queue.current?.push(progress);
		setAnswers(nextAnswers);
		if (target) {
			setPosition(target.key);
			setAnnouncement(mover === "self" ? strings.card.movedOn(whereIs(definition, target)) : "");
		} else if (direction === "next") {
			void finish();
		}
	};

	/**
	 * Stores the answer on the card without leaving it, when the tab is hidden: the person may
	 * never come back, and what they typed is an answer given.
	 */
	const hold = (value: AnswerValue) => {
		if (!isAsking(step)) return;
		const item = itemOf(step);
		const before = getAnswer(answers, step.questionId, item);
		if (JSON.stringify(before?.value ?? null) === JSON.stringify(value)) return;
		const activeMs = clock.current?.take() ?? 0;
		queue.current?.push({
			answer: {
				question: step.questionId,
				...(item === undefined ? {} : { item }),
				value,
				activeMs,
			},
		});
		setAnswers(
			withAnswer(answers, step.questionId, item, {
				value,
				activeMs: (before?.activeMs ?? 0) + activeMs,
				changes: before?.changes ?? 0,
			}),
		);
	};

	const section = definition.sections.find((candidate) => candidate.id === step.sectionId);
	if (!section) return null;
	const auto = { on: autoAdvance, set: chooseAutoAdvance };
	const canGoBack = index > 0;

	let card = null;
	if (step.kind === "section") {
		card = (
			<SectionCard
				key={step.key}
				step={step}
				section={section}
				canGoBack={canGoBack}
				autoAdvance={auto}
				onLeave={(direction) => leave(direction)}
			/>
		);
	} else if (step.kind === "followUpsIntro") {
		const group = section.type === "repeat" ? section.groups[step.group - 1] : undefined;
		const following = new Set(
			steps.flatMap((candidate) =>
				candidate.kind === "followUp" && candidate.groupId === step.groupId
					? [candidate.itemId]
					: [],
			),
		);
		card = group && (
			<FollowUpsIntroCard
				key={step.key}
				step={step}
				section={section}
				group={group}
				items={group.items.filter((item) => following.has(item.id))}
				onLeave={(direction) => leave(direction)}
			/>
		);
	} else {
		const question = places.questions.get(step.questionId)?.question;
		const place = step.kind === "question" ? undefined : places.items.get(step.itemId);
		card = question && (
			<AskingCard
				key={step.key}
				step={step}
				section={section}
				question={question}
				group={place?.group}
				item={place?.item}
				stored={getAnswer(answers, step.questionId, itemOf(step))}
				canGoBack={canGoBack}
				isLast={(value) => {
					if (value === undefined) return index === steps.length - 1;
					const answer = { value, activeMs: 0, changes: 0 };
					const after = flow(
						definition,
						withAnswer(answers, step.questionId, itemOf(step), answer),
					);
					return after[after.length - 1]?.key === step.key;
				}}
				autoAdvance={auto}
				onLeave={leave}
				onHold={hold}
			/>
		);
	}

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-4 pb-10 sm:px-6">
			<header className="flex min-h-14 items-center">
				<p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
					{definition.title}
				</p>
			</header>
			{initial.formChanged && (
				<p className="mb-3 rounded-md border px-3 py-2 text-sm text-muted-foreground">
					{strings.response.formChanged}
				</p>
			)}
			{failing && (
				<div
					role="alert"
					className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive px-3 py-2 text-sm"
				>
					<span>{strings.saving.failed}</span>
					<Button variant="outline" onClick={() => queue.current?.retry()}>
						{strings.saving.retry}
					</Button>
				</div>
			)}
			{refused && (
				<div
					role="alert"
					className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive px-3 py-2 text-sm"
				>
					<span>{strings.saving.refused}</span>
					<Button variant="outline" onClick={() => setRefused(false)}>
						{strings.saving.dismiss}
					</Button>
				</div>
			)}
			{finishing === "failed" && (
				<div
					role="alert"
					className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive px-3 py-2 text-sm"
				>
					<span>{strings.end.finishFailed}</span>
					<Button variant="outline" onClick={() => void finish()}>
						{strings.error.retry}
					</Button>
				</div>
			)}
			<main className="flex flex-col">{card}</main>
			<footer className="mt-auto pt-12">
				<ContinueElsewhere formId={definition.id} responseId={responseId} secret={secret} />
			</footer>
			{/* Says so when a card moved on by itself, without taking the focus. */}
			<p aria-live="polite" className="sr-only">
				{announcement}
			</p>
		</div>
	);
}
