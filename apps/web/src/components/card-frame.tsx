import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
} from "react";
import { cn } from "#/lib/cn";
import { strings } from "#/lib/strings";
import { Button } from "./button";

/** The side a card arrives from: the right when the form went on, the left when it went back. */
export type Entering = "next" | "back";

/**
 * Puts the keyboard and the screen reader at the top of a new card. Without this, focus stays
 * on a button that is gone, and a screen reader says nothing about the card having changed.
 * It is the one thing a screen reader hears of the change: the motion says nothing to it.
 *
 * A new card starts at the top of the page. On a phone, a card too long for the screen starts
 * a little further down instead: far enough to bring its answers up, and never past its
 * heading. What scrolls out is the form's title and the lines that say where the card is, which
 * are the same from card to card; what the card asks stays whole. Without this, a group of
 * long items on a small phone would need a scroll before every single answer.
 */
export function useCardFocus(): RefObject<HTMLHeadingElement | null> {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		window.scrollTo(0, 0);
		const title = heading.current;
		const card = title?.closest("[data-card]");
		const bar = document.querySelector("[data-bar]");
		if (title && card && bar && window.matchMedia("(max-width: 639.98px)").matches) {
			// The card has to end above the bar when the bar stays on screen, and on screen otherwise.
			const end =
				getComputedStyle(bar).position === "sticky"
					? bar.getBoundingClientRect().top
					: window.innerHeight;
			const over = card.getBoundingClientRect().bottom - end;
			// The heading's block may begin with a line above it, such as the item a follow-up is about.
			const block = title.parentElement === card ? title : (title.parentElement ?? title);
			const room = block.getBoundingClientRect().top - 12;
			if (over > 0 && room > 0) window.scrollTo(0, Math.min(over, room));
		}
		title?.focus({ preventScroll: true });
	}, []);
	return heading;
}

/** One size for every card's heading, a step smaller on a phone, where a question is a sentence. */
export const headingClass =
	"text-[1.375rem] leading-7 font-semibold tracking-tight text-balance break-words outline-none sm:text-2xl sm:leading-8";

/** A line of the position: its words, and what must stay readable at its end, such as "3 of 12". */
export type PositionLine = string | { text: string; tail: string };

/**
 * Which leg, and inside a repeat section which group and item. Words only, and no percentage.
 * The card's heading is described by it, so a screen reader that lands on the heading says
 * where the card is as well as what it asks.
 *
 * Each line keeps to one line. A long title is cut short with an ellipsis rather than wrapped:
 * it was read in full on the opening card, and on a phone two wrapped lines of it would push
 * the answers off the screen on every one of a group's cards. A line's tail is never cut.
 */
export function Position({ id, lines }: { id: string; lines: PositionLine[] }) {
	return (
		<div id={id} className="flex flex-col gap-0.5 text-sm text-muted-foreground">
			{lines.map((line) => {
				const text = typeof line === "string" ? line : line.text;
				return (
					<p key={text} className="flex min-w-0">
						<span className="truncate">{text}</span>
						{typeof line !== "string" && (
							<span className="shrink-0 whitespace-pre">{line.tail}</span>
						)}
					</p>
				);
			})}
		</div>
	);
}

/** "Made with Gateweave Forms", small, at the end of the page. */
export function MadeWith({ className }: { className?: string }) {
	return (
		<p className={cn("flex justify-center text-xs text-muted-foreground", className)}>
			{/* A new tab, so that following it never leaves the form half-answered. */}
			<a
				href={strings.madeWith.href}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex min-h-11 items-center rounded-md px-3 underline-offset-4 hover:text-foreground hover:underline"
			>
				{strings.madeWith.label}
			</a>
		</p>
	);
}

/**
 * What every card is made of: a surface that holds the card, and under it the bar with Back and
 * the way forward.
 *
 * On a phone the bar stays at the bottom of the screen, where a thumb is (`.card-bar` in
 * styles.css). It is `sticky`, not `fixed`: it keeps its place in the page, so the card ends
 * above it and nothing can be left underneath it. On a screen too short to spare the room, and
 * at a desk, the bar simply follows the card.
 *
 * Only the surface moves when a card changes. The bar stays put, so the button a thumb is
 * resting over is not somewhere else for a moment.
 */
export function CardFrame({
	entering,
	leaving = false,
	onSubmit,
	onKeyDown,
	canGoBack,
	onBack,
	forward,
	quiet = false,
	children,
}: {
	entering: Entering;
	/** The card is on its way out after an answer. It takes no more presses. */
	leaving?: boolean;
	onSubmit: () => void;
	onKeyDown?: (event: KeyboardEvent<HTMLFormElement>) => void;
	canGoBack: boolean;
	onBack: () => void;
	forward: string;
	/** For "Skip": passing a question is allowed, and it should not be the loudest thing on the card. */
	quiet?: boolean;
	children: ReactNode;
}) {
	const submit = (event: FormEvent) => {
		event.preventDefault();
		onSubmit();
	};
	return (
		<form className="flex flex-col" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
			<div
				data-card
				className={cn(
					"flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:gap-5 sm:p-8",
					entering === "back" ? "card-in-back" : "card-in-next",
					leaving && "card-out pointer-events-none",
				)}
			>
				{children}
			</div>
			<div
				data-bar
				className="card-bar order-3 -mx-2 flex items-center gap-3 bg-page px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:order-2 sm:mx-0 sm:justify-between sm:bg-transparent sm:px-0 sm:pt-4 sm:pb-0"
			>
				{canGoBack && (
					<Button variant="outline" className="min-w-24 bg-card" onClick={onBack}>
						{strings.nav.back}
					</Button>
				)}
				<Button
					type="submit"
					variant={quiet ? "outline" : "primary"}
					className={cn("flex-1 sm:ml-auto sm:min-w-32 sm:flex-none", quiet && "bg-card")}
				>
					{forward}
				</Button>
			</div>
			<MadeWith className="order-2 sm:order-3 sm:mt-6" />
		</form>
	);
}
