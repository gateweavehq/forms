import {
	type Answer,
	type AnswerValue,
	type AskingStep,
	type FollowUpsIntroStep,
	type Group,
	type Item,
	mergeCount,
	mergeItem,
	needsAnswer,
	type Question,
	type Section,
	type SectionStep,
} from "@gateweave/forms-schema";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type Draft, fromDraft, isEmptyDraft, toDraft } from "#/lib/draft";
import { strings } from "#/lib/strings";
import {
	CardFrame,
	type Entering,
	headingClass,
	Position,
	type PositionLine,
	useCardFocus,
} from "./card-frame";
import { type GroupMark, GroupMarks } from "./group-marks";
import { QuestionInput } from "./inputs";
import { More, RichTextView } from "./rich-text";

/**
 * How long a tapped answer stays on screen before the card moves on: long enough to see which
 * answer was taken, short enough not to feel like waiting.
 */
const PAUSE_MS = 350;

/**
 * How much of that pause the card stands still with its tick showing, before it starts to leave.
 * The rest is the leaving, which therefore costs no time of its own: the answer is stored when
 * the pause is over, by the same timer, whether anything moved or not. That keeps the time on a
 * card, and on the one after it, the same for a person who asked for less motion.
 */
const HOLD_MS = 260;

export type Direction = "next" | "back";

/** Where a card is left for: the next one, the one before, or a card named by its key. */
export type Move = Direction | { to: string };

/** Whether the person moved, or the card moved on by itself after their answer. */
export type Mover = "person" | "self";

/** What an item is, in a line: read at arm's length on a phone, so a little larger than the rest. */
const definitionClass = "text-[1.0625rem] leading-6 text-muted-foreground break-words";

/** The start of a leg: its title, its text, what is in it and roughly how long it takes. */
export function SectionCard({
	step,
	section,
	entering,
	canGoBack,
	onLeave,
}: {
	step: SectionStep;
	section: Section;
	entering: Entering;
	canGoBack: boolean;
	onLeave: (direction: Direction) => void;
}) {
	const heading = useCardFocus();
	const positionId = useId();
	const facts: string[] = [];
	if (section.type === "repeat") {
		const items = section.groups.reduce((count, group) => count + group.items.length, 0);
		facts.push(strings.section.items(items, section.groups.length));
	} else {
		// Detached questions are asked at the end, apart, and are not this part's.
		const asked = section.questions.filter((question) => !question.detached);
		const always = asked.filter((question) => question.showIf === undefined);
		if (asked.length > 0) facts.push(strings.section.questions(always.length, asked.length));
	}
	if (section.minutes !== undefined) facts.push(strings.section.minutes(section.minutes));
	return (
		<CardFrame
			entering={entering}
			onSubmit={() => onLeave("next")}
			canGoBack={canGoBack}
			onBack={() => onLeave("back")}
			forward={strings.nav.begin}
		>
			<Position id={positionId} lines={[strings.position.leg(step.leg, step.legs)]} />
			<div className="flex flex-col gap-2">
				<h1 ref={heading} tabIndex={-1} aria-describedby={positionId} className={headingClass}>
					{section.title}
				</h1>
				{facts.map((fact, index) => (
					<p key={fact} className={index === 0 ? "font-medium" : "text-muted-foreground"}>
						{fact}
					</p>
				))}
			</div>
			{section.text && <RichTextView text={section.text} />}
			{section.type === "repeat" && (
				<>
					{section.groups.length > 1 && (
						<ol className="flex flex-col divide-y rounded-lg border">
							{section.groups.map((group) => (
								<li key={group.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
									<span className="min-w-0 font-medium break-words">{group.title}</span>
									<span className="shrink-0 text-sm text-muted-foreground">
										{strings.section.groupItems(group.items.length)}
									</span>
								</li>
							))}
						</ol>
					)}
					{/* Said before the first card, so that moving on by itself is expected. */}
					<p className="text-sm text-muted-foreground">{strings.section.movesOn}</p>
				</>
			)}
		</CardFrame>
	);
}

/** Introduces a group's follow-ups: how many items they are about, and which. */
export function FollowUpsIntroCard({
	step,
	section,
	group,
	items,
	entering,
	onLeave,
}: {
	step: FollowUpsIntroStep;
	section: Section;
	group: Group;
	entering: Entering;
	/** The items the follow-ups are about, in order. */
	items: Item[];
	onLeave: (direction: Direction) => void;
}) {
	const heading = useCardFocus();
	const positionId = useId();
	const intro = section.type === "repeat" ? section.block.followUpsIntro : undefined;
	return (
		<CardFrame
			entering={entering}
			onSubmit={() => onLeave("next")}
			canGoBack
			onBack={() => onLeave("back")}
			forward={strings.nav.continue}
		>
			<Position
				id={positionId}
				lines={[
					`${strings.position.leg(step.leg, step.legs)} · ${section.title}`,
					strings.position.group(step.group, step.groups, group.title),
				]}
			/>
			<h1 ref={heading} tabIndex={-1} aria-describedby={positionId} className={headingClass}>
				{intro ? mergeCount(intro, step.count) : strings.section.followUpsIntro(step.count)}
			</h1>
			<ul className="flex list-disc flex-col gap-1 pl-5">
				{items.map((item) => (
					<li key={item.id}>{item.label}</li>
				))}
			</ul>
		</CardFrame>
	);
}

export interface AskingCardProps {
	step: AskingStep;
	section: Section;
	question: Question;
	/** The group and item, for the steps of a repeat section. */
	group?: Group | undefined;
	item?: Item | undefined;
	/** The answer already stored, when the person has been here before. */
	stored: Answer | undefined;
	entering: Entering;
	canGoBack: boolean;
	/** The marks of the item's group, on an item's card. */
	marks?: GroupMark[] | undefined;
	/**
	 * Whether this would be the form's last card with that answer on it (`undefined`: with the
	 * answer already stored). An answer can close the questions after it, and the button should
	 * say "Finish" as soon as it does.
	 */
	isLast: (value: AnswerValue | null | undefined) => boolean;
	/** Whether an item's card moves on by itself after an answer. */
	autoAdvance: boolean;
	/**
	 * Called when the card is left. `value` is the answer to store, `null` for none, and
	 * `undefined` when what the inputs hold cannot be stored and the person is going back anyway.
	 */
	onLeave: (move: Move, value: AnswerValue | null | undefined, mover: Mover) => void;
	/** Called with the answer on the card when the tab is hidden, so that it is stored anyway. */
	onHold: (value: AnswerValue) => void;
}

/**
 * One question on a card. For an item's status question the card is the item: its label, its
 * one-line definition, the longer detail behind "more", and the answers as full-width buttons.
 */
export function AskingCard({
	step,
	section,
	question,
	group,
	item,
	stored,
	entering,
	canGoBack,
	marks,
	isLast,
	autoAdvance,
	onLeave,
	onHold,
}: AskingCardProps) {
	const heading = useCardFocus();
	const positionId = useId();
	const labelId = useId();
	const problemId = useId();
	const [draft, setDraft] = useState<Draft>(() => toDraft(stored?.value));
	const [problem, setProblem] = useState<string>();
	const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
	const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
	/** The card is leaving by itself: the last stretch of the pause after an answer. */
	const [leaving, setLeaving] = useState(false);
	const stopPause = () => {
		clearTimeout(pause.current);
		clearTimeout(hold.current);
		setLeaving(false);
	};
	useEffect(
		() => () => {
			clearTimeout(pause.current);
			clearTimeout(hold.current);
		},
		[],
	);

	// Closing the tab, or switching away for good, must not lose what is on the card. The
	// listener is set once and reads the latest draft through a ref.
	const held = useRef({ draft, question, onHold });
	held.current = { draft, question, onHold };
	useEffect(() => {
		const onHidden = () => {
			if (document.visibilityState !== "hidden") return;
			const checked = fromDraft(held.current.question, held.current.draft);
			if (checked.ok && checked.value !== null) held.current.onHold(checked.value);
		};
		document.addEventListener("visibilitychange", onHidden);
		return () => document.removeEventListener("visibilitychange", onHidden);
	}, []);

	const isStatus = step.kind === "status";
	const label = item ? mergeItem(question.label, item) : question.label;

	const change = (next: Draft) => {
		// An answer picked and then changed within the pause moves on with the later one.
		stopPause();
		setDraft(next);
		setProblem(undefined);
	};

	const leave = (move: Move, using: Draft, mover: Mover) => {
		stopPause();
		const checked = fromDraft(question, using);
		if (checked.ok) onLeave(move, checked.value, mover);
		// Only the way forward waits for an answer that can be stored. Going back, or to another
		// card by its mark, leaves what is half-typed behind.
		else if (move !== "next") onLeave(move, undefined, mover);
		else setProblem(checked.problem);
	};

	/** A tap or a number key on a status card answers it and moves on after a short pause. */
	const picked = (next: Draft) => {
		if (!isStatus || !autoAdvance || !("options" in question)) return;
		// An answer that asks for a line of text needs the person to stay and type it.
		if (question.options.find((option) => option.id === next.option)?.specify) return;
		stopPause();
		hold.current = setTimeout(() => setLeaving(true), HOLD_MS);
		pause.current = setTimeout(() => leave("next", next, "self"), PAUSE_MS);
	};

	/**
	 * Number keys pick an answer. The handler is on the card, so the keys act only while focus is
	 * inside it: a single-key shortcut that listened on the whole page would fire for people who
	 * dictate, and whenever focus was somewhere else.
	 */
	const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
		if (question.type !== "single_choice" || !/^[1-9]$/.test(event.key)) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const { target } = event;
		const typing =
			(target instanceof HTMLInputElement && target.type !== "radio") ||
			target instanceof HTMLTextAreaElement;
		const option = question.options[Number(event.key) - 1];
		if (typing || !option) return;
		event.preventDefault();
		const next = { ...draft, option: option.id };
		change(next);
		picked(next);
	};

	const lines: PositionLine[] = [`${strings.position.leg(step.leg, step.legs)} · ${section.title}`];
	if (step.kind !== "question" && group) {
		const inGroup = strings.position.group(step.group, step.groups, group.title);
		const within = isStatus
			? strings.position.item(step.item, step.items)
			: strings.position.followUp(step.item, step.items);
		lines.push({ text: inGroup, tail: ` · ${within}` });
	}

	const now = fromDraft(question, draft);
	const forward = isLast(now.ok ? now.value : undefined)
		? strings.nav.finish
		: isEmptyDraft(question, draft) && !needsAnswer(question)
			? strings.nav.skip
			: strings.nav.next;

	let top: ReactNode;
	if (isStatus && item) {
		top = (
			<>
				<div className="flex flex-col gap-2">
					<h1 ref={heading} tabIndex={-1} aria-describedby={positionId} className={headingClass}>
						{item.label}
					</h1>
					{item.definition && <p className={definitionClass}>{item.definition}</p>}
					{item.detail && <More text={item.detail} />}
				</div>
				<p id={labelId} className="text-lg font-medium text-balance break-words">
					{label}
				</p>
			</>
		);
	} else {
		top = (
			<div className="flex flex-col gap-2">
				{item && <p className="text-base font-medium text-muted-foreground">{item.label}</p>}
				<h1
					ref={heading}
					id={labelId}
					tabIndex={-1}
					aria-describedby={positionId}
					className={headingClass}
				>
					{label}
				</h1>
			</div>
		);
	}

	return (
		<CardFrame
			entering={entering}
			leaving={leaving}
			onSubmit={() => leave("next", draft, "person")}
			onKeyDown={onKeyDown}
			canGoBack={canGoBack}
			onBack={() => leave("back", draft, "person")}
			forward={forward}
			// On a card that moves on by itself the tap is the way forward, and the button beside
			// Back stays quiet whatever it says, so that it does not flash as the answer lands.
			quiet={forward === strings.nav.skip || (isStatus && autoAdvance)}
		>
			<Position id={positionId} lines={lines} />
			{marks && group && (
				<GroupMarks
					group={group.title}
					marks={marks}
					onOpen={(key) => leave({ to: key }, draft, "person")}
				/>
			)}
			{top}
			{question.description && (
				<RichTextView text={question.description} className="text-muted-foreground" />
			)}
			{question.detail && <More text={question.detail} />}
			<div className="flex flex-col gap-3">
				<QuestionInput
					question={question}
					item={item}
					draft={draft}
					onDraft={change}
					onPicked={picked}
					labelledBy={labelId}
					problemId={problem ? problemId : undefined}
					keyHints
				/>
				{problem && (
					<p id={problemId} role="alert" className="text-base font-medium text-destructive">
						{problem}
					</p>
				)}
			</div>
		</CardFrame>
	);
}
