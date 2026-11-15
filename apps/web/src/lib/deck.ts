import type { AskingStep, StatusStep, Step } from "@gateweave/forms-schema";

interface GroupCardBase {
	key: string;
	/**
	 * The step of the flow this card stands beside. A response's position is stored as a step's
	 * key, so a card that is not a step saves this one, and that is where the person comes back.
	 */
	anchor: string;
	sectionId: string;
	leg: number;
	legs: number;
	groupId: string;
	group: number;
	groups: number;
}

/** A group begins: its name and how many items it has. The first group's is the leg's own card. */
export interface GroupOpeningCard extends GroupCardBase {
	kind: "groupOpening";
}

/** A look back at a group's answers, after its last item and before its follow-ups. */
export interface ReviewCard extends GroupCardBase {
	kind: "review";
}

/** What the page shows one at a time: the flow's steps, and the two cards the page adds. */
export type Card = Step | GroupOpeningCard | ReviewCard;

/**
 * The cards a person goes through: the flow's steps in the flow's order, with an opening before
 * each group after the first and a look back after each group's items.
 *
 * Both are the page's own. They ask nothing and store nothing, so the flow, which the server
 * shares, does not know them, and the order of the questions is the flow's alone.
 */
export function deckOf(steps: Step[]): Card[] {
	const cards: Card[] = [];
	let open: StatusStep | undefined;
	const close = () => {
		if (!open) return;
		const { sectionId, leg, legs, groupId, group, groups } = open;
		cards.push({
			kind: "review",
			key: `r:${groupId}`,
			anchor: open.key,
			...{ sectionId, leg, legs, groupId, group, groups },
		});
		open = undefined;
	};
	for (const step of steps) {
		if (step.kind !== "status") {
			close();
			cards.push(step);
			continue;
		}
		if (open && open.groupId !== step.groupId) close();
		if (!open && step.group > 1) {
			const { sectionId, leg, legs, groupId, group, groups } = step;
			cards.push({
				kind: "groupOpening",
				key: `g:${groupId}`,
				anchor: step.key,
				...{ sectionId, leg, legs, groupId, group, groups },
			});
		}
		open = step;
		cards.push(step);
	}
	close();
	return cards;
}

/** Whether a card asks a question, which is to say whether leaving it stores an answer. */
export function asks(card: Card): card is AskingStep {
	return card.kind === "question" || card.kind === "status" || card.kind === "followUp";
}

/** The key to store as the response's position while this card is shown. */
export function positionOf(card: Card): string {
	return "anchor" in card ? card.anchor : card.key;
}
