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
 * One small mark for each item of the group being answered: filled when it has its answer, ringed
 * when it is the one on the card. A mark of an item already seen goes back to it.
 *
 * This is the only progress the form shows, and it is one group's worth on purpose. A bar or a
 * percentage across a long form crawls, and people who watch it crawl quit; a handful of marks
 * that fill in a minute do not. The marks count nothing and promise nothing about the rest.
 *
 * Up to six, each mark sits in a cell 44 pixels square, which is what a thumb needs. A longer
 * group cannot have that without taking two or three rows from the answers on every card, so
 * its marks stand close together, and a finger is not offered them at all: touch goes back with
 * Back, or picks an item from the look back at the group's end. A mouse and a keyboard, which
 * can hit a small mark, still can.
 *
 * The marks are one stop for the Tab key, and the arrow keys move between them, so a keyboard
 * does not have to walk a dozen marks to reach the answers.
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
	const roomy = marks.length <= ROOMY;
	const cell = roomy ? "size-11" : "h-6 w-full";
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
			className={cn("flex flex-wrap", roomy ? "-my-3 -ml-[15px]" : "-mx-1")}
			onKeyDown={onKeyDown}
		>
			{marks.map((mark, index) => {
				const dot = (
					<span
						aria-hidden="true"
						className={cn(
							"block size-3.5 rounded-full border-2",
							mark.answered ? "border-brand bg-brand" : "border-input",
							mark.current && "outline-2 outline-offset-2 outline-brand/40",
							mark.current && !mark.answered && "border-brand",
						)}
					/>
				);
				return (
					<li
						key={mark.key}
						aria-current={mark.current ? "step" : undefined}
						className={cn(!roomy && "max-w-11 min-w-5 flex-1")}
					>
						{mark.seen && !mark.current ? (
							<button
								type="button"
								tabIndex={index === stop ? 0 : -1}
								aria-label={
									mark.answered
										? strings.marks.answered(mark.label)
										: strings.marks.passed(mark.label)
								}
								className={cn(
									"grid cursor-pointer touch-manipulation place-items-center rounded-full hover:bg-accent",
									cell,
									!roomy && "pointer-coarse:pointer-events-none",
								)}
								onClick={() => onOpen(mark.key)}
							>
								{dot}
							</button>
						) : (
							<span className={cn("grid place-items-center", cell)}>
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
