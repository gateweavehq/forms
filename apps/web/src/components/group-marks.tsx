import type { KeyboardEvent } from "react";
import { cn } from "#/lib/cn";
import { strings } from "#/lib/strings";

export interface GroupMark {
	/** The card to open: the item's first status question. */
	key: string;
	label: string;
	answered: boolean;
	/** The person has been on this item's card, with or without leaving an answer. */
	seen: boolean;
	current: boolean;
}

/** The most marks that fit in one row at a thumb's size on the narrowest phone. */
const ROOMY = 6;

/**
 * A mark. One that waits for its answer is drawn in the colour of quiet text, not of a border:
 * it is information, and has to stand out from the card by 3 to 1 at least in both themes.
 */
function Dot({ mark }: { mark: GroupMark }) {
	return (
		<span
			data-mark={mark.answered ? "answered" : "open"}
			aria-hidden="true"
			className={cn(
				"block size-3.5 rounded-full border-2",
				mark.answered ? "border-brand bg-brand" : "border-muted-foreground",
				mark.current && "outline-2 outline-offset-2 outline-brand/40",
				mark.current && !mark.answered && "border-brand",
			)}
		/>
	);
}

/**
 * One small mark for each item of the group being answered: filled when it has its answer, ringed
 * when it is the one on the card.
 *
 * This is the only progress the form shows, and it is one group's worth on purpose. A bar or a
 * percentage across a long form crawls, and people who watch it crawl quit; a handful of marks
 * that fill in a minute do not. The marks count nothing and promise nothing about the rest.
 *
 * In a group of up to six, a mark of an item already seen goes back to it, and each mark sits
 * in a cell 44 pixels square, which is what a thumb needs. They are one stop for the Tab key,
 * and the arrow keys move between them.
 *
 * A longer group cannot have cells that size without taking two or three rows from the answers
 * on every card, and a control too small for a thumb is worse than none. So its marks are a
 * picture and nothing else, for every pointer: not buttons, not in the Tab order, and hidden
 * from screen readers, which hear the same thing in words ("3 of 12") from the line above.
 * Back, and the look back at the group's end, do the going back.
 */
export function GroupMarks({
	group,
	marks,
	onOpen,
}: {
	group: string;
	marks: GroupMark[];
	onOpen: (key: string) => void;
}) {
	if (marks.length > ROOMY) {
		return (
			<div data-marks="picture" aria-hidden="true" className="-mx-1 flex flex-wrap">
				{marks.map((mark) => (
					<span key={mark.key} className="grid h-6 max-w-11 min-w-4 flex-1 place-items-center">
						<Dot mark={mark} />
					</span>
				))}
			</div>
		);
	}

	const current = marks.findIndex((mark) => mark.current);
	// Where Tab lands: the item just before this one, which is where "back by one" goes.
	const open = marks.map((mark, index) => (mark.seen && !mark.current ? index : -1));
	const stop =
		open.filter((index) => index >= 0 && index < current).pop() ??
		open.find((index) => index >= 0) ??
		-1;

	const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		const buttons = [...event.currentTarget.querySelectorAll("button")];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		event.preventDefault();
		buttons[at + (event.key === "ArrowRight" ? 1 : -1)]?.focus();
	};

	return (
		<ol
			aria-label={strings.marks.label(group)}
			// Pulled in by what the cells have around their marks, so that the row takes a mark's
			// height on the card and starts at the text's edge.
			className="-my-3 -ml-[15px] flex flex-wrap"
			onKeyDown={onKeyDown}
		>
			{marks.map((mark, index) => {
				const dot = <Dot mark={mark} />;
				return (
					<li key={mark.key} aria-current={mark.current ? "step" : undefined}>
						{mark.seen && !mark.current ? (
							<button
								type="button"
								tabIndex={index === stop ? 0 : -1}
								aria-label={
									mark.answered
										? strings.marks.answered(mark.label)
										: strings.marks.passed(mark.label)
								}
								className="grid size-11 cursor-pointer touch-manipulation place-items-center rounded-full hover:bg-accent"
								onClick={() => onOpen(mark.key)}
							>
								{dot}
							</button>
						) : (
							<span className="grid size-11 place-items-center">
								{dot}
								<span className="sr-only">
									{mark.current
										? strings.marks.current(mark.label)
										: strings.marks.ahead(mark.label)}
								</span>
							</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}
