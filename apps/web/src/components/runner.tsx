import {
	type AnswerValue,
	type Definition,
	detachedQuestions,
	flow,
	getAnswer,
	isAnswered,
	itemOf,
	mergeItem,
	placesOf,
	type ResponseAnswers,
	reachedAnswers,
	withAnswer,
	withdrawalOf,
} from "@gateweave/forms-schema";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActiveClock } from "#/lib/active-clock";
import { answerText } from "#/lib/answer-text";
import {
	completeResponse,
	loadResponse,
	type Progress,
	type ResponseState,
	sendProgress,
} from "#/lib/client";
import { asks, deckOf, positionOf } from "#/lib/deck";
import {
	autoAdvancePreferred,
	forgetResponse,
	preferAutoAdvance,
	rememberedResponse,
	rememberResponse,
} from "#/lib/local";
import { SaveQueue } from "#/lib/save-queue";
import { strings } from "#/lib/strings";
import { AnswersSummary } from "./answers-summary";
import { Button } from "./button";
import { type Entering, MadeWith } from "./card-frame";
import { AskingCard, FollowUpsIntroCard, type Move, type Mover, SectionCard } from "./cards";
import { EndPage } from "./end-page";
import type { GroupMark } from "./group-marks";
import { Notice } from "./notice";
import { OptionsMenu } from "./options-menu";
import { GroupOpeningCard, ReviewCard, type ReviewRow } from "./review-card";

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
	/** Whether the server would take the answers back: its word, never worked out here. */
	const [canWithdraw, setCanWithdraw] = useState(initial.canWithdraw);
	const [withdrawn, setWithdrawn] = useState(false);
	const [finishing, setFinishing] = useState<"no" | "sending" | "failed">("no");
	const [failing, setFailing] = useState(false);
	const [refused, setRefused] = useState(false);
	/** What a screen reader is told, and how many times it has been told something. */
	const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
	const [autoAdvance, setAutoAdvance] = useState(true);
	/** The side the card on screen came from, which is the way the person last went. */
	const [entering, setEntering] = useState<Entering>("next");
	/** The look back the card on screen was opened from, and goes back to once answered. */
	const [returnTo, setReturnTo] = useState<string>();

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

	const cards = useMemo(() => deckOf(flow(definition, answers)), [definition, answers]);
	// A position the form no longer has (it was edited since) starts over at the top.
	const index = Math.max(
		0,
		cards.findIndex((candidate) => candidate.key === position),
	);
	const card = cards[index];

	const finish = useCallback(async () => {
		setFinishing("sending");
		try {
			// Every answer first: completing is refused while a required one has not arrived.
			await queue.current?.settled();
			const done = await completeResponse(responseId, secret);
			forgetResponse(definition.id);
			setCanWithdraw(done.canWithdraw);
			setCompleted(true);
		} catch {
			setFinishing("failed");
		}
	}, [definition.id, responseId, secret]);

	const chooseAutoAdvance = (on: boolean) => {
		setAutoAdvance(on);
		preferAutoAdvance(on);
	};

	if (withdrawn) {
		// What a form keeps apart is only ever sent once a response is complete, so only someone
		// who had finished can have left any.
		const mayHaveLeft = completed && detachedQuestions(definition).length > 0;
		return (
			<Notice title={strings.yours.withdrawnTitle}>
				{strings.yours.withdrawnBody} {mayHaveLeft && `${strings.yours.withdrawnDetached} `}
				{strings.yours.withdrawnClose}
			</Notice>
		);
	}
	if (completed) {
		return (
			<EndPage
				definition={definition}
				askDetached={!initial.completed}
				version={initial.version}
				responseId={responseId}
				secret={secret}
				canWithdraw={canWithdraw}
				onWithdrawn={() => setWithdrawn(true)}
				footer={<MadeWith className="mt-auto pt-6" />}
			>
				<AnswersSummary definition={definition} answers={answers} />
			</EndPage>
		);
	}
	if (!card) return null;

	/** Leaves the current card: stores its answer, if it has one, and moves. */
	const leave = (
		move: Move,
		value?: AnswerValue | null,
		mover: Mover = "person",
		/** The look back to come back to, when this move opens one of its lines. */
		from?: string,
	) => {
		const progress: Progress = {};
		let nextAnswers = answers;
		if (asks(card) && value !== undefined) {
			const item = itemOf(card);
			const activeMs = clock.current?.take() ?? 0;
			progress.answer = {
				question: card.questionId,
				...(item === undefined ? {} : { item }),
				value,
				activeMs,
			};
			// A copy for this page only. What counts as a change is the server's to say.
			const before = getAnswer(answers, card.questionId, item);
			nextAnswers = withAnswer(answers, card.questionId, item, {
				value,
				activeMs: (before?.activeMs ?? 0) + activeMs,
				changes: before?.changes ?? 0,
			});
		} else {
			// Time on a card that asks nothing belongs to no answer.
			clock.current?.take();
		}

		// The answer just given may open or close cards after this one, never before it. What
		// was answered under a card it closed is taken back, as the server does on saving it.
		nextAnswers = reachedAnswers(definition, nextAnswers).answers;
		const nextCards = deckOf(flow(definition, nextAnswers));
		const here = nextCards.findIndex((candidate) => candidate.key === card.key);
		const find = (key: string | undefined) =>
			key === undefined ? undefined : nextCards.find((candidate) => candidate.key === key);
		const target =
			typeof move === "object"
				? find(move.to)
				: move === "next"
					? (find(returnTo) ?? nextCards[here + 1])
					: nextCards[here - 1];
		if (target) progress.position = positionOf(target);
		if (progress.answer || progress.position) queue.current?.push(progress);
		setAnswers(nextAnswers);
		setReturnTo(from);
		if (target) {
			setEntering(nextCards.indexOf(target) < here ? "back" : "next");
			setPosition(target.key);
			// A new node each time, so that the same words are said again for the next card.
			setAnnouncement(({ count }) =>
				mover === "self" ? { text: strings.card.movedOn, count: count + 1 } : { text: "", count },
			);
		} else if (move === "next") {
			void finish();
		}
	};

	/**
	 * Stores the answer on the card without leaving it, when the tab is hidden: the person may
	 * never come back, and what they typed is an answer given.
	 */
	const hold = (value: AnswerValue) => {
		if (!asks(card)) return;
		const item = itemOf(card);
		const before = getAnswer(answers, card.questionId, item);
		if (JSON.stringify(before?.value ?? null) === JSON.stringify(value)) return;
		const activeMs = clock.current?.take() ?? 0;
		queue.current?.push({
			answer: {
				question: card.questionId,
				...(item === undefined ? {} : { item }),
				value,
				activeMs,
			},
		});
		setAnswers(
			withAnswer(answers, card.questionId, item, {
				value,
				activeMs: (before?.activeMs ?? 0) + activeMs,
				changes: before?.changes ?? 0,
			}),
		);
	};

	const section = definition.sections.find((candidate) => candidate.id === card.sectionId);
	if (!section) return null;
	const canGoBack = index > 0;
	const hasRepeat = definition.sections.some((candidate) => candidate.type === "repeat");
	const groupOf = (groupId: string) =>
		section.type === "repeat"
			? section.groups.find((candidate) => candidate.id === groupId)
			: undefined;

	let shown = null;
	if (card.kind === "section") {
		shown = (
			<SectionCard
				key={card.key}
				step={card}
				section={section}
				entering={entering}
				canGoBack={canGoBack}
				onLeave={(direction) => leave(direction)}
			/>
		);
	} else if (card.kind === "groupOpening") {
		const group = groupOf(card.groupId);
		shown = group && (
			<GroupOpeningCard
				key={card.key}
				card={card}
				section={section}
				group={group}
				entering={entering}
				onLeave={(direction) => leave(direction)}
			/>
		);
	} else if (card.kind === "review") {
		const group = groupOf(card.groupId);
		const several = section.type === "repeat" && section.block.status.length > 1;
		const rows: ReviewRow[] = cards.flatMap((candidate) => {
			if (candidate.kind !== "status" || candidate.groupId !== card.groupId) return [];
			const question = places.questions.get(candidate.questionId)?.question;
			const item = places.items.get(candidate.itemId)?.item;
			if (!question || !item) return [];
			const value = getAnswer(answers, candidate.questionId, candidate.itemId)?.value;
			return [
				{
					key: candidate.key,
					// The question as it was asked of this item, with the item's name in it.
					label: several ? `${item.label}: ${mergeItem(question.label, item)}` : item.label,
					answer: answerText(question, value, item),
				},
			];
		});
		shown = group && (
			<ReviewCard
				key={card.key}
				card={card}
				section={section}
				group={group}
				rows={rows}
				entering={entering}
				last={index === cards.length - 1}
				onOpen={(key) => leave({ to: key }, undefined, "person", card.key)}
				onLeave={(direction) => leave(direction)}
			/>
		);
	} else if (card.kind === "followUpsIntro") {
		const group = groupOf(card.groupId);
		const following = new Set(
			cards.flatMap((candidate) =>
				candidate.kind === "followUp" && candidate.groupId === card.groupId
					? [candidate.itemId]
					: [],
			),
		);
		shown = group && (
			<FollowUpsIntroCard
				key={card.key}
				step={card}
				section={section}
				group={group}
				items={group.items.filter((item) => following.has(item.id))}
				entering={entering}
				onLeave={(direction) => leave(direction)}
			/>
		);
	} else {
		const question = places.questions.get(card.questionId)?.question;
		const place = card.kind === "question" ? undefined : places.items.get(card.itemId);
		// One mark for each item of this card's group: answered when every status question of the
		// item is, and seen once any of them has been stored, with or without an answer.
		let marks: GroupMark[] | undefined;
		if (card.kind === "status") {
			const byItem = new Map<string, GroupMark>();
			for (const candidate of cards) {
				if (candidate.kind !== "status" || candidate.groupId !== card.groupId) continue;
				const stored = getAnswer(answers, candidate.questionId, candidate.itemId);
				const answered = isAnswered(stored?.value);
				const mark = byItem.get(candidate.itemId);
				if (mark) {
					mark.answered &&= answered;
					mark.seen ||= stored !== undefined;
				} else {
					byItem.set(candidate.itemId, {
						key: candidate.key,
						label: places.items.get(candidate.itemId)?.item.label ?? "",
						answered,
						seen: stored !== undefined,
						current: candidate.itemId === card.itemId,
					});
				}
			}
			marks = [...byItem.values()];
		}
		shown = question && (
			<AskingCard
				key={card.key}
				step={card}
				section={section}
				question={question}
				group={place?.group}
				item={place?.item}
				stored={getAnswer(answers, card.questionId, itemOf(card))}
				entering={entering}
				canGoBack={canGoBack}
				marks={marks}
				isLast={(value) => {
					if (value === undefined) return index === cards.length - 1;
					const answer = { value, activeMs: 0, changes: 0 };
					const after = deckOf(
						flow(definition, withAnswer(answers, card.questionId, itemOf(card), answer)),
					);
					return after[after.length - 1]?.key === card.key;
				}}
				autoAdvance={autoAdvance}
				onLeave={leave}
				onHold={hold}
			/>
		);
	}

	const alert =
		"mx-2 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive bg-card px-3 py-2 text-sm sm:mx-0";
	return (
		// Clipped sideways: a card that slides must not make the page scroll for a moment.
		<div className="min-h-svh overflow-x-clip bg-page">
			<div className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-2 sm:px-6 sm:pb-6">
				<header className="flex min-h-12 items-center gap-3 px-2 sm:min-h-16 sm:px-0">
					<p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
						{definition.title}
					</p>
					<OptionsMenu
						autoAdvance={hasRepeat ? { on: autoAdvance, set: chooseAutoAdvance } : undefined}
						formId={definition.id}
						responseId={responseId}
						secret={secret}
						version={initial.version}
						hasConsent={definition.consent !== undefined}
						withdrawal={withdrawalOf(definition)}
						onWithdrawn={() => {
							// Nothing more is sent for a response that is gone.
							queue.current?.stop();
							setWithdrawn(true);
						}}
					/>
				</header>
				{initial.formChanged && (
					<p className="mx-2 mb-3 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground sm:mx-0">
						{strings.response.formChanged}
					</p>
				)}
				{failing && (
					<div role="alert" className={alert}>
						<span>{strings.saving.failed}</span>
						<Button variant="outline" onClick={() => queue.current?.retry()}>
							{strings.saving.retry}
						</Button>
					</div>
				)}
				{refused && (
					<div role="alert" className={alert}>
						<span>{strings.saving.refused}</span>
						<Button variant="outline" onClick={() => setRefused(false)}>
							{strings.saving.dismiss}
						</Button>
					</div>
				)}
				{finishing === "failed" && (
					<div role="alert" className={alert}>
						<span>{strings.end.finishFailed}</span>
						<Button variant="outline" onClick={() => void finish()}>
							{strings.error.retry}
						</Button>
					</div>
				)}
				{/*
				 * On a phone a card with answers lies at the bottom of the screen, on the bar: what is
				 * tapped is where the thumb is, and stays there from card to card. A card with nothing
				 * to press fills the height and stands in its middle (`resting` in card-frame.tsx).
				 * At a desk every card starts at the top.
				 */}
				<main className="flex flex-1 flex-col justify-end sm:justify-start">{shown}</main>
				{/* Says so when a card moved on by itself, without taking the focus. */}
				<p aria-live="polite" className="sr-only">
					{announcement.text && <span key={announcement.count}>{announcement.text}</span>}
				</p>
			</div>
		</div>
	);
}
