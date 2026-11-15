import { type Definition, placesOf } from "@gateweave/forms-schema";
import { median, share } from "./numbers";
import { activeMsOf, DEVICES, type Device, type ResponseRecord } from "./records";

/** A place in a form where a response can have stopped: a section, or a group of a repeat section. */
export interface StoppingPlace {
	sectionId: string;
	section: string;
	groupId?: string;
	group?: string;
	/** Responses that are not complete and were last here. */
	count: number;
}

export interface Overview {
	started: number;
	completed: number;
	/** Completed out of started, from 0 to 1. Nothing when none started. */
	completedShare: number | null;
	/** The median active time of completed responses, for all of them and by device. */
	activeTime: Array<{ device: Device | "all"; completed: number; medianMs: number | null }>;
	/** Where the responses that are not complete were last, in the form's order. */
	stopped: StoppingPlace[];
	/** Not complete, and no place was ever saved: they agreed to start and did nothing more. */
	stoppedAtStart: number;
	/** Not complete, at a place this definition does not have. */
	stoppedElsewhere: number;
}

/**
 * The place a saved position is in: `s:<section>`, `q:<question>`, `i:<item>:<question>` or
 * `f:<group>`, as the flow writes its steps' keys. The browser sends the position, so one that
 * names nothing in the form is expected and counted apart.
 */
function placeOf(
	definition: Definition,
	position: string,
): { sectionId: string; groupId?: string } | undefined {
	const [kind, first = ""] = position.split(":");
	const places = placesOf(definition);
	if (kind === "s") {
		const section = definition.sections.find(({ id }) => id === first);
		if (!section) return undefined;
		// A repeat section's own step comes before its first group.
		const group = section.type === "repeat" ? section.groups[0] : undefined;
		return { sectionId: section.id, ...(group ? { groupId: group.id } : {}) };
	}
	if (kind === "q") {
		const place = places.questions.get(first);
		return place && place.part === undefined ? { sectionId: place.section.id } : undefined;
	}
	if (kind === "i") {
		const place = places.items.get(first);
		return place ? { sectionId: place.section.id, groupId: place.group.id } : undefined;
	}
	if (kind === "f") {
		for (const section of definition.sections) {
			if (section.type !== "repeat") continue;
			if (section.groups.some(({ id }) => id === first)) {
				return { sectionId: section.id, groupId: first };
			}
		}
	}
	return undefined;
}

export function overview(definition: Definition, records: ResponseRecord[]): Overview {
	const completed = records.filter((record) => record.completedAt !== null);
	const open = records.filter((record) => record.completedAt === null);

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
	let stoppedAtStart = 0;
	let stoppedElsewhere = 0;
	for (const record of open) {
		if (record.position === null) {
			stoppedAtStart++;
			continue;
		}
		const place = placeOf(definition, record.position);
		const row = place
			? stopped.find(
					(candidate) =>
						candidate.sectionId === place.sectionId && candidate.groupId === place.groupId,
				)
			: undefined;
		if (row) row.count++;
		else stoppedElsewhere++;
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
		stoppedAtStart,
		stoppedElsewhere,
	};
}
