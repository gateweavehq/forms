import type { Group, Section } from "@gateweave/forms-schema";
import { useId } from "react";
import type { GroupOpeningCard as GroupOpening, ReviewCard as Review } from "#/lib/deck";
import { strings } from "#/lib/strings";
import { CardFrame, type Entering, headingClass, Position, useCardFocus } from "./card-frame";

export interface ReviewRow {
	/** The card that asked: the row opens it. */
	key: string;
	label: string;
	/** The answer in the person's words, or nothing when the item was passed. */
	answer: string | undefined;
}

/**
 * A look back at a group, after its last item and before anything that follows from the answers.
 *
 * Cards that move on by themselves are quick, and their measured cost is that people correct
 * fewer answers. This is where a slip gets caught: every item of the group with the answer it
 * was given, in one list, and each line opens its card again. Answering there comes back here.
 */
export function ReviewCard({
	card,
	section,
	group,
	rows,
	entering,
	last,
	onOpen,
	onLeave,
}: {
	card: Review;
	section: Section;
	group: Group;
	rows: ReviewRow[];
	entering: Entering;
	/** Nothing comes after this card, so its button finishes the form. */
	last: boolean;
	onOpen: (key: string) => void;
	onLeave: (direction: "next" | "back") => void;
}) {
	const heading = useCardFocus();
	const positionId = useId();
	return (
		<CardFrame
			entering={entering}
			onSubmit={() => onLeave("next")}
			canGoBack
			onBack={() => onLeave("back")}
			forward={last ? strings.nav.finish : strings.nav.continue}
		>
			<Position
				id={positionId}
				lines={[
					`${strings.position.leg(card.leg, card.legs)} · ${section.title}`,
					strings.position.group(card.group, card.groups, group.title),
				]}
			/>
			<div className="flex flex-col gap-2">
				<h1 ref={heading} tabIndex={-1} aria-describedby={positionId} className={headingClass}>
					{strings.review.title(group.title)}
				</h1>
				<p className="text-muted-foreground">{strings.review.hint}</p>
			</div>
			<ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
				{rows.map((row) => (
					<li key={row.key}>
						<button
							type="button"
							aria-label={strings.review.change(row.label, row.answer ?? strings.review.none)}
							className="flex min-h-12 w-full cursor-pointer touch-manipulation items-center gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:-outline-offset-2"
							onClick={() => onOpen(row.key)}
						>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="font-medium break-words">{row.label}</span>
								<span className="text-sm break-words text-muted-foreground">
									{row.answer ?? strings.review.none}
								</span>
							</span>
							<span aria-hidden="true" className="shrink-0 text-lg text-muted-foreground">
								›
							</span>
						</button>
					</li>
				))}
			</ul>
		</CardFrame>
	);
}

/** A group begins: its name and how many items it has. One button to begin. */
export function GroupOpeningCard({
	card,
	section,
	group,
	entering,
	onLeave,
}: {
	card: GroupOpening;
	section: Section;
	group: Group;
	entering: Entering;
	onLeave: (direction: "next" | "back") => void;
}) {
	const heading = useCardFocus();
	const positionId = useId();
	return (
		<CardFrame
			entering={entering}
			onSubmit={() => onLeave("next")}
			canGoBack
			onBack={() => onLeave("back")}
			forward={strings.nav.begin}
		>
			<Position
				id={positionId}
				lines={[
					`${strings.position.leg(card.leg, card.legs)} · ${section.title}`,
					strings.position.groupOnly(card.group, card.groups),
				]}
			/>
			<div className="flex flex-col gap-2">
				<h1 ref={heading} tabIndex={-1} aria-describedby={positionId} className={headingClass}>
					{group.title}
				</h1>
				<p className="text-muted-foreground">{strings.section.items(group.items.length, 1)}</p>
			</div>
		</CardFrame>
	);
}
