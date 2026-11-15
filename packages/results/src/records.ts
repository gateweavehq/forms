import {
	type Answer,
	type Definition,
	isChoice,
	type Question,
	type ResponseAnswers,
	reachedAnswers,
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

/** What `reached` worked out before, by response and by the definition it was read with. */
const reachedBefore = new WeakMap<
	ResponseRecord,
	{ definition: Definition; record: ResponseRecord }
>();

/**
 * A response with only the answers its own flow reaches. An answer under a question that a
 * later change closed was taken back, and must not be counted, listed or exported. The server
 * removes such rows when the change is saved; this does not rely on it, so that a row which
 * escaped (older data, two requests at once) is still left out of every result.
 *
 * Everything in this package that reads answers reads them through here.
 */
export function reached(definition: Definition, record: ResponseRecord): ResponseRecord {
	const before = reachedBefore.get(record);
	if (before?.definition === definition) return before.record;
	const { answers, unreached } = reachedAnswers(definition, record.answers);
	const kept = unreached.length === 0 ? record : { ...record, answers };
	reachedBefore.set(record, { definition, record: kept });
	// What comes out is already reached: asking again costs a look-up, not a flow.
	if (kept !== record) reachedBefore.set(kept, { definition, record: kept });
	return kept;
}

/** Every response as `reached` gives it. */
export function allReached(definition: Definition, records: ResponseRecord[]): ResponseRecord[] {
	return records.map((record) => reached(definition, record));
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
	return allReached(definition, records).filter((record) => {
		if (filter.device !== undefined && record.device !== filter.device) return false;
		if (question) {
			const value = record.answers.questions[question.id]?.value;
			if (value === null || value === undefined || !isChoice(value)) return false;
			if (value.option !== filter.option) return false;
		}
		return true;
	});
}
