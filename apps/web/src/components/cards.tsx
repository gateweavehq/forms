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
import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { type Draft, fromDraft, isEmptyDraft, toDraft } from "#/lib/draft";
import { strings } from "#/lib/strings";
import { Button } from "./button";
import { QuestionInput } from "./inputs";
import { More, RichTextView } from "./rich-text";

/**
 * How long a tapped answer stays on screen before the card moves on: long enough to see which
 * answer was taken, short enough not to feel like waiting.
 */
const PAUSE_MS = 350;

export type Direction = "next" | "back";

/** Whether the person moved, or the card moved on by itself after their answer. */
export type Mover = "person" | "self";

/**
 * Which leg, and inside a repeat section which group and item. Words only, and no percentage.
 * The card's heading is described by it, so a screen reader that lands on the heading says
 * where the card is as well as what it asks.
 */
function Position({ id, lines }: { id: string; lines: string[] }) {
	return (
		<div id={id} className="flex flex-col gap-0.5 text-sm text-muted-foreground">
			{lines.map((line) => (
				<p key={line}>{line}</p>
			))}
		</div>
	);
}

/**
 * Puts the keyboard and the screen reader at the top of a new card. Without this, focus stays
 * on a button that is gone, and a screen reader says nothing about the card having changed.
 */
function useCardFocus() {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		window.scrollTo(0, 0);
		heading.current?.focus({ preventScroll: true });
	}, []);
	return heading;
}

function Navigation({
	canGoBack,
	onBack,
	forward,
	quiet = false,
}: {
	canGoBack: boolean;
	onBack: () => void;
	forward: string;
	/** For "Skip": passing a question is allowed, and it should not be the loudest thing on the card. */
	quiet?: boolean;
}) {
	return (
		<div className="mt-2 flex items-center justify-between gap-3">
			{canGoBack ? (
				<Button variant="outline" onClick={onBack}>
					{strings.nav.back}
				</Button>
			) : (
				<span />
			)}
			<Button type="submit" variant={quiet ? "outline" : "primary"} className="min-w-28">
				{forward}
			</Button>
		</div>
	);
}

/** The switch that stops cards from moving on by themselves. */
function AutoAdvanceSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
	return (
		<label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted-foreground">
			<input
				type="checkbox"
				className="size-5 accent-foreground"
				checked={on}
				onChange={(event) => onChange(event.target.checked)}
			/>
			{strings.card.autoAdvance}
		</label>
	);
}

const cardClass = "card-in flex flex-col gap-5 pt-2";
const headingClass = "text-2xl font-semibold tracking-tight text-balance break-words outline-none";
/** A question is a sentence, not a title: a size smaller on a phone, where it would fill the screen. */
const questionClass =
	"text-xl font-semibold tracking-tight text-balance break-words outline-none sm:text-2xl";

export interface AutoAdvance {
	on: boolean;
	set: (on: boolean) => void;
}

/** The start of a leg: its title, its text, and what is in it. */
export function SectionCard({
	step,
	section,
	canGoBack,
	autoAdvance,
	onLeave,
}: {
	step: SectionStep;
	section: Section;
	canGoBack: boolean;
	autoAdvance: AutoAdvance;
	onLeave: (direction: Direction) => void;
}) {
	const heading = useCardFocus();
	const positionId = useId();
	const items =
		section.type === "repeat"
			? section.groups.reduce((count, group) => count + group.items.length, 0)
			: 0;
	const submit = (event: FormEvent) => {
		event.preventDefault();
		onLeave("next");
	};
	return (
		<form className={cardClass} onSubmit={submit}>
			<Position id={positionId} lines={[strings.position.leg(step.leg, step.legs)]} />
			<h1 ref={heading} tabIndex={-1} aria-describedby={positionId} className={headingClass}>
				{section.title}
			</h1>
			{section.text && <RichTextView text={section.text} />}
			{section.type === "repeat" && (
				<>
					<p className="text-muted-foreground">
						{strings.section.items(items, section.groups.length)}
					</p>
					{/* Said before the first card, so that moving on by itself is expected. */}
					<p className="text-muted-foreground">{strings.section.movesOn}</p>
					<AutoAdvanceSwitch on={autoAdvance.on} onChange={autoAdvance.set} />
				</>
			)}
			<Navigation
				canGoBack={canGoBack}
				onBack={() => onLeave("back")}
				forward={strings.nav.continue}
			/>
		</form>
	);
}

/** Introduces a group's follow-ups: how many items they are about, and which. */
export function FollowUpsIntroCard({
	step,
	section,
	group,
	items,
	onLeave,
}: {
	step: FollowUpsIntroStep;
	section: Section;
	group: Group;
	/** The items the follow-ups are about, in order. */
	items: Item[];
	onLeave: (direction: Direction) => void;
}) {
	const heading = useCardFocus();
	const positionId = useId();
	const intro = section.type === "repeat" ? section.block.followUpsIntro : undefined;
	const submit = (event: FormEvent) => {
		event.preventDefault();
		onLeave("next");
	};
	return (
		<form className={cardClass} onSubmit={submit}>
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
			<Navigation canGoBack onBack={() => onLeave("back")} forward={strings.nav.continue} />
		</form>
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
	canGoBack: boolean;
	/**
	 * Whether this would be the form's last card with that answer on it (`undefined`: with the
	 * answer already stored). An answer can close the questions after it, and the button should
	 * say "Finish" as soon as it does.
	 */
	isLast: (value: AnswerValue | null | undefined) => boolean;
	autoAdvance: AutoAdvance;
	/**
	 * Called when the card is left. `value` is the answer to store, `null` for none, and
	 * `undefined` when what the inputs hold cannot be stored and the person is going back anyway.
	 */
	onLeave: (direction: Direction, value: AnswerValue | null | undefined, mover: Mover) => void;
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
	canGoBack,
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
	useEffect(() => () => clearTimeout(pause.current), []);

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
		clearTimeout(pause.current);
		setDraft(next);
		setProblem(undefined);
	};

	const leave = (direction: Direction, using: Draft, mover: Mover) => {
		clearTimeout(pause.current);
		const checked = fromDraft(question, using);
		if (checked.ok) onLeave(direction, checked.value, mover);
		else if (direction === "back") onLeave("back", undefined, mover);
		else setProblem(checked.problem);
	};

	/** A tap or a number key on a status card answers it and moves on after a short pause. */
	const picked = (next: Draft) => {
		if (!isStatus || !autoAdvance.on || !("options" in question)) return;
		// An answer that asks for a line of text needs the person to stay and type it.
		if (question.options.find((option) => option.id === next.option)?.specify) return;
		clearTimeout(pause.current);
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

	const submit = (event: FormEvent) => {
		event.preventDefault();
		leave("next", draft, "person");
	};

	const lines = [`${strings.position.leg(step.leg, step.legs)} · ${section.title}`];
	if (step.kind !== "question" && group) {
		const inGroup = strings.position.group(step.group, step.groups, group.title);
		const within = isStatus
			? strings.position.item(step.item, step.items)
			: strings.position.followUp(step.item, step.items);
		lines.push(`${inGroup} · ${within}`);
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
					{item.definition && <p className="text-base text-muted-foreground">{item.definition}</p>}
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
					className={questionClass}
				>
					{label}
				</h1>
			</div>
		);
	}

	return (
		<form className={cardClass} onSubmit={submit} onKeyDown={onKeyDown} noValidate>
			<Position id={positionId} lines={lines} />
			{top}
			{question.description && (
				<RichTextView text={question.description} className="text-muted-foreground" />
			)}
			{question.detail && <More text={question.detail} />}
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
			<Navigation
				canGoBack={canGoBack}
				onBack={() => leave("back", draft, "person")}
				forward={forward}
				quiet={forward === strings.nav.skip}
			/>
			{isStatus && (
				<div className="flex flex-col border-t pt-3">
					<AutoAdvanceSwitch on={autoAdvance.on} onChange={autoAdvance.set} />
					{"options" in question && (
						<p className="hidden text-sm text-muted-foreground pointer-fine:block">
							{strings.card.keys(Math.min(question.options.length, 9))}
						</p>
					)}
				</div>
			)}
		</form>
	);
}
