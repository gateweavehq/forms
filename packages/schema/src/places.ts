import type { Definition, Group, Item, Question, RepeatSection, Section } from "./definition";

/** Where a question sits in its form. */
export interface QuestionPlace {
	question: Question;
	section: Section;
	/** Which part of a repeat section's block it belongs to. Absent for a section's own question. */
	part?: "status" | "followUps";
	/** Its position in reading order, counted across the whole form. */
	order: number;
}

/** Where an item sits in its form. */
export interface ItemPlace {
	item: Item;
	group: Group;
	section: RepeatSection;
}

/** A form's questions and items by id, for looking one up without walking the sections. */
export interface Places {
	questions: Map<string, QuestionPlace>;
	items: Map<string, ItemPlace>;
}

/** Every question of a form in reading order: section by section, a block's status first. */
export function questionsInOrder(definition: Definition): QuestionPlace[] {
	const places: QuestionPlace[] = [];
	const add = (question: Question, section: Section, part?: "status" | "followUps") => {
		places.push({ question, section, ...(part ? { part } : {}), order: places.length });
	};
	for (const section of definition.sections) {
		if (section.type === "questions") {
			for (const question of section.questions) add(question, section);
		} else {
			for (const question of section.block.status) add(question, section, "status");
			for (const question of section.block.followUps) add(question, section, "followUps");
		}
	}
	return places;
}

/**
 * Looks a valid definition's questions and items up by id. In a definition that has not been
 * checked, an id used twice keeps its first place.
 */
export function placesOf(definition: Definition): Places {
	const questions = new Map<string, QuestionPlace>();
	for (const place of questionsInOrder(definition)) {
		if (!questions.has(place.question.id)) questions.set(place.question.id, place);
	}
	const items = new Map<string, ItemPlace>();
	for (const section of definition.sections) {
		if (section.type !== "repeat") continue;
		for (const group of section.groups) {
			for (const item of group.items) {
				if (!items.has(item.id)) items.set(item.id, { item, group, section });
			}
		}
	}
	return { questions, items };
}

/** The questions whose answers are asked at the end and stored apart, in order. */
export function detachedQuestions(definition: Definition): Question[] {
	return questionsInOrder(definition)
		.filter((place) => place.question.detached)
		.map((place) => place.question);
}
