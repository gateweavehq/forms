import { type Definition, isChoice } from "@gateweave/forms-schema";
import { median } from "./numbers";
import { activeMsOf, answersOf, type ResponseRecord } from "./records";

/** A completed response counts as fast when its active time is under this part of the median. */
export const FAST_SHARE = 0.3;

/** A group needs this many answered items before the same answer to all of them means anything. */
export const STRAIGHT_MIN_ITEMS = 3;

/**
 * Things about one response that are worth a second look. None of them proves anything: a
 * person who really has made none of the breads answers "never" nine times.
 */
export interface ResponseSignals {
	id: string;
	activeMs: number;
	/** Completed in under 30% of the median active time of the completed responses. */
	fast: boolean;
	/** Groups of a repeat section where every answered item got the same status, by title. */
	straight: string[];
	/** How many answers were replaced by a different one. */
	changes: number;
}

export interface Signals {
	/** The median active time of the completed responses, which `fast` is measured against. */
	medianMs: number | null;
	responses: ResponseSignals[];
}

/**
 * The groups where a response gave every item the same answer to the block's first status
 * question, at least three items of it.
 */
function straightGroups(definition: Definition, record: ResponseRecord): string[] {
	const found: string[] = [];
	for (const section of definition.sections) {
		if (section.type !== "repeat") continue;
		const [status] = section.block.status;
		if (!status) continue;
		for (const group of section.groups) {
			const chosen = group.items.flatMap((item) => {
				const value = record.answers.items[item.id]?.[status.id]?.value;
				return value !== null && value !== undefined && isChoice(value) ? [value.option] : [];
			});
			if (chosen.length >= STRAIGHT_MIN_ITEMS && new Set(chosen).size === 1) {
				found.push(group.title);
			}
		}
	}
	return found;
}

/**
 * What stands out about each response. Give it every response of the version, not a filtered
 * part: "fast" is measured against the median of all that completed.
 */
export function signals(definition: Definition, records: ResponseRecord[]): Signals {
	const medianMs = median(records.filter((record) => record.completedAt !== null).map(activeMsOf));
	return {
		medianMs,
		responses: records.map((record) => {
			const activeMs = activeMsOf(record);
			return {
				id: record.id,
				activeMs,
				fast: record.completedAt !== null && medianMs !== null && activeMs < medianMs * FAST_SHARE,
				straight: straightGroups(definition, record),
				changes: answersOf(record).reduce((sum, { answer }) => sum + answer.changes, 0),
			};
		}),
	};
}
