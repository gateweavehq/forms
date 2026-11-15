import {
	type Definition,
	flow,
	getAnswer,
	isAsking,
	itemOf,
	mergeItem,
	placesOf,
} from "@gateweave/forms-schema";
import { median, share } from "./numbers";
import { activeMsOf, allReached, DEVICES, type Device, type ResponseRecord } from "./records";

/** A place in a form where a response can have stopped: a section, or a group of a repeat section. */
export interface StoppingPlace {
	sectionId: string;
	section: string;
	groupId?: string;
	group?: string;
	/** Responses that are not complete and got no further than here. */
	count: number;
}

/** A question that was the last one some unfinished responses got to. */
export interface LastQuestion {
	/** The step's key, as the flow names it. */
	key: string;
	/** The question's wording, for an item's question with the item's name filled in. */
	label: string;
	count: number;
}

export interface Overview {
	started: number;
	completed: number;
	/** Completed out of started, from 0 to 1. Nothing when none started. */
	completedShare: number | null;
	/** The median active time of completed responses, for all of them and by device. */
	activeTime: Array<{ device: Device | "all"; completed: number; medianMs: number | null }>;
	/** How many unfinished responses stopped in each part of the form, in its order. */
	stopped: StoppingPlace[];
	/** The questions they stopped at, in the form's order. Only those where someone did. */
	lastQuestions: LastQuestion[];
	/** Not complete, and nothing was answered or passed: they started and did nothing more. */
	stoppedAtStart: number;
}

/**
 * The last question of its own flow that an unfinished response answered or passed. The flow is
 * worked out from the response's answers, so this is where the person was, by what the server
 * holds. The position a browser saves is not used: it is the browser's word, and it moves when
 * someone only looks back.
 */
function lastStep(definition: Definition, record: ResponseRecord) {
	const asked = flow(definition, record.answers).filter(isAsking);
	return asked.findLast(
		(step) => getAnswer(record.answers, step.questionId, itemOf(step)) !== undefined,
	);
}

export function overview(definition: Definition, given: ResponseRecord[]): Overview {
	const records = allReached(definition, given);
	const completed = records.filter((record) => record.completedAt !== null);
	const open = records.filter((record) => record.completedAt === null);
	const places = placesOf(definition);

	const stopped: StoppingPlace[] = definition.sections.flatMap((section) =>
		section.type === "questions"
			? [{ sectionId: section.id, section: section.title, count: 0 }]
			: section.groups.map((group) => ({
					sectionId: section.id,
					section: section.title,
					groupId: group.id,
					group: group.title,
					count: 0,
				})),
	);
	/** By step key, with the place of the step in the response's flow to order them by. */
	const last = new Map<string, LastQuestion & { order: number }>();
	let stoppedAtStart = 0;
	for (const record of open) {
		const step = lastStep(definition, record);
		if (!step) {
			stoppedAtStart++;
			continue;
		}
		const groupId = step.kind === "question" ? undefined : step.groupId;
		const row = stopped.find(
			(candidate) => candidate.sectionId === step.sectionId && candidate.groupId === groupId,
		);
		if (row) row.count++;

		const known = last.get(step.key);
		if (known) {
			known.count++;
			continue;
		}
		const question = places.questions.get(step.questionId);
		const item = step.kind === "question" ? undefined : places.items.get(step.itemId);
		const label = question?.question.label ?? step.questionId;
		last.set(step.key, {
			key: step.key,
			label: item ? mergeItem(label, item.item) : label,
			count: 1,
			order: orderOf(definition, step.sectionId, groupId, question?.order ?? 0),
		});
	}

	return {
		started: records.length,
		completed: completed.length,
		completedShare: share(completed.length, records.length),
		activeTime: (["all", ...DEVICES] as const).map((device) => {
			const own = device === "all" ? completed : completed.filter((r) => r.device === device);
			return { device, completed: own.length, medianMs: median(own.map(activeMsOf)) };
		}),
		stopped,
		lastQuestions: [...last.values()]
			.sort((a, b) => a.order - b.order)
			.map(({ key, label, count }) => ({ key, label, count })),
		stoppedAtStart,
	};
}

/**
 * A number that puts stopping points in the form's order: by section, then by group, then by
 * the question's place. Items of one group and question share it, and keep the order they were
 * first seen in.
 */
function orderOf(
	definition: Definition,
	sectionId: string,
	groupId: string | undefined,
	question: number,
): number {
	const sectionIndex = definition.sections.findIndex(({ id }) => id === sectionId);
	const section = definition.sections[sectionIndex];
	const groupIndex =
		section?.type === "repeat" && groupId !== undefined
			? section.groups.findIndex(({ id }) => id === groupId)
			: 0;
	return sectionIndex * 1e10 + groupIndex * 1e6 + question;
}
