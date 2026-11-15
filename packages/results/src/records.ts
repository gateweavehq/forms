import {
	type Answer,
	type Definition,
	isChoice,
	type Question,
	type ResponseAnswers,
} from "@gateweave/forms-schema";

export type Device = "phone" | "tablet" | "desk";

export const DEVICES: Device[] = ["phone", "tablet", "desk"];

/** One response as the results read it: what is stored about it, and its answers. */
export interface ResponseRecord {
	id: string;
	device: Device;
	createdAt: number;
	completedAt: number | null;
	/** The step the person was on when they last saved, as the flow names it. */
	position: string | null;
	answers: ResponseAnswers;
}

/** Every answer of a response, with the item it is about for a block's question. */
export function answersOf(
	record: ResponseRecord,
): Array<{ questionId: string; itemId: string | undefined; answer: Answer }> {
	const all: Array<{ questionId: string; itemId: string | undefined; answer: Answer }> = [];
	for (const [questionId, answer] of Object.entries(record.answers.questions)) {
		all.push({ questionId, itemId: undefined, answer });
	}
	for (const [itemId, own] of Object.entries(record.answers.items)) {
		for (const [questionId, answer] of Object.entries(own)) {
			all.push({ questionId, itemId, answer });
		}
	}
	return all;
}

/** The time a response's questions were on screen in a visible tab, added up. */
export function activeMsOf(record: ResponseRecord): number {
	return answersOf(record).reduce((sum, { answer }) => sum + answer.activeMs, 0);
}

/** Which responses to count: those from one kind of device, those that gave one answer, or both. */
export interface Filter {
	device?: Device | undefined;
	/** A single-choice or dropdown question outside the repeat sections, and one of its options. */
	question?: string | undefined;
	option?: string | undefined;
}

/** The questions a filter can be about: one answer out of a few, asked once per response. */
export function filterQuestions(definition: Definition): Question[] {
	return definition.sections.flatMap((section) =>
		section.type === "questions"
			? section.questions.filter(
					(question) =>
						(question.type === "single_choice" || question.type === "dropdown") &&
						!question.detached,
				)
			: [],
	);
}

/** The responses a filter keeps. A filter that names no known question keeps them all. */
export function applyFilter(
	definition: Definition,
	records: ResponseRecord[],
	filter: Filter,
): ResponseRecord[] {
	const question =
		filter.question !== undefined && filter.option !== undefined
			? filterQuestions(definition).find(({ id }) => id === filter.question)
			: undefined;
	return records.filter((record) => {
		if (filter.device !== undefined && record.device !== filter.device) return false;
		if (question) {
			const value = record.answers.questions[question.id]?.value;
			if (value === null || value === undefined || !isChoice(value)) return false;
			if (value.option !== filter.option) return false;
		}
		return true;
	});
}
