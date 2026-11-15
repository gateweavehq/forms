import type { ResponseAnswers } from "./answers";
import type { Definition, Question } from "./definition";
import { detachedQuestions, placesOf } from "./places";
import { holds } from "./rules";
import { type AnswerValue, isAnswered } from "./values";

interface StepBase {
	/** Names the step for as long as the definition stays the same. A response's position is one. */
	key: string;
	sectionId: string;
	/** Which leg this is, from 1, and how many the form has. */
	leg: number;
	legs: number;
}

/** A leg begins: its title and text. */
export interface SectionStep extends StepBase {
	kind: "section";
}

/** One question of a `questions` section. */
export interface QuestionStep extends StepBase {
	kind: "question";
	questionId: string;
}

interface GroupStep extends StepBase {
	groupId: string;
	/** Which group this is, from 1, and how many the section has. */
	group: number;
	groups: number;
}

/** A status question for one item: the card that one tap answers. */
export interface StatusStep extends GroupStep {
	kind: "status";
	itemId: string;
	/** Which item of the group this is, from 1, and how many the group has. */
	item: number;
	items: number;
	questionId: string;
}

/** A group's follow-ups begin: says how many items have any. */
export interface FollowUpsIntroStep extends GroupStep {
	kind: "followUpsIntro";
	count: number;
}

/** One follow-up question for one item. */
export interface FollowUpStep extends GroupStep {
	kind: "followUp";
	itemId: string;
	/** Which of the group's items with follow-ups this is, from 1, and how many there are. */
	item: number;
	items: number;
	questionId: string;
}

export type Step = SectionStep | QuestionStep | StatusStep | FollowUpsIntroStep | FollowUpStep;

/** A step that asks a question. */
export type AskingStep = QuestionStep | StatusStep | FollowUpStep;

export function isAsking(step: Step): step is AskingStep {
	return step.kind === "question" || step.kind === "status" || step.kind === "followUp";
}

/** The item an asking step is about, for the steps of a repeat section. */
export function itemOf(step: AskingStep): string | undefined {
	return step.kind === "question" ? undefined : step.itemId;
}

type Shown = Map<string, AnswerValue>;

function isShown(question: Question, answerOf: (id: string) => AnswerValue | undefined): boolean {
	return question.showIf === undefined || holds(question.showIf, answerOf);
}

/**
 * The steps a person goes through, in order, given the answers so far.
 *
 * A repeat section asks the status of every item of a group first and the follow-ups afterwards,
 * item by item, for the items that have any. Asking them in place, under the answer that opened
 * them, teaches people which answer costs more questions, and they stop giving it.
 *
 * A question that is not shown counts as unanswered for the rules after it, so changing an
 * answer closes everything that hung on the old one. Rules only look backwards, so the steps
 * before the one being answered never change under the person.
 *
 * Detached questions are not steps: they are asked at the end, apart (`detachedQuestionsShown`).
 */
export function flow(definition: Definition, answers: ResponseAnswers): Step[] {
	const steps: Step[] = [];
	const legs = definition.sections.length;
	/** The answers of the questions shown so far, outside blocks. */
	const top: Shown = new Map();

	definition.sections.forEach((section, sectionIndex) => {
		const base = { sectionId: section.id, leg: sectionIndex + 1, legs };
		steps.push({ kind: "section", key: `s:${section.id}`, ...base });

		if (section.type === "questions") {
			for (const question of section.questions) {
				if (question.detached || !isShown(question, (id) => top.get(id))) continue;
				steps.push({
					kind: "question",
					key: `q:${question.id}`,
					...base,
					questionId: question.id,
				});
				const value = answers.questions[question.id]?.value;
				if (isAnswered(value)) top.set(question.id, value);
			}
			return;
		}

		section.groups.forEach((group, groupIndex) => {
			const inGroup = {
				...base,
				groupId: group.id,
				group: groupIndex + 1,
				groups: section.groups.length,
			};
			/** Each item's own shown answers, which its block's rules read before `top`. */
			const own = new Map<string, Shown>();
			const ask = (question: Question, itemId: string): boolean => {
				const shown = own.get(itemId) ?? new Map<string, AnswerValue>();
				own.set(itemId, shown);
				if (!isShown(question, (id) => shown.get(id) ?? top.get(id))) return false;
				const value = answers.items[itemId]?.[question.id]?.value;
				if (isAnswered(value)) shown.set(question.id, value);
				return true;
			};

			group.items.forEach((item, itemIndex) => {
				for (const question of section.block.status) {
					if (!ask(question, item.id)) continue;
					steps.push({
						kind: "status",
						key: `i:${item.id}:${question.id}`,
						...inGroup,
						itemId: item.id,
						item: itemIndex + 1,
						items: group.items.length,
						questionId: question.id,
					});
				}
			});

			const following = group.items
				.map((item) => ({
					item,
					questions: section.block.followUps.filter((question) => ask(question, item.id)),
				}))
				.filter(({ questions }) => questions.length > 0);
			if (following.length === 0) return;

			steps.push({
				kind: "followUpsIntro",
				key: `f:${group.id}`,
				...inGroup,
				count: following.length,
			});
			following.forEach(({ item, questions }, index) => {
				for (const question of questions) {
					steps.push({
						kind: "followUp",
						key: `i:${item.id}:${question.id}`,
						...inGroup,
						itemId: item.id,
						item: index + 1,
						items: following.length,
						questionId: question.id,
					});
				}
			});
		});
	});

	return steps;
}

/**
 * The asking steps whose question is required and has no answer. A response can be completed
 * when this is empty.
 */
export function unansweredRequired(definition: Definition, answers: ResponseAnswers): AskingStep[] {
	const places = placesOf(definition);
	return flow(definition, answers)
		.filter(isAsking)
		.filter((step) => {
			const question = places.questions.get(step.questionId)?.question;
			if (!question?.required) return false;
			const item = itemOf(step);
			const answer =
				item === undefined
					? answers.questions[step.questionId]
					: answers.items[item]?.[step.questionId];
			return !isAnswered(answer?.value);
		});
}

/**
 * The detached questions to show, given the detached answers typed so far. Their rules can only
 * look at each other, which the definition's check guarantees.
 */
export function detachedQuestionsShown(
	definition: Definition,
	values: Record<string, AnswerValue | null | undefined>,
): Question[] {
	const shown: Shown = new Map();
	return detachedQuestions(definition).filter((question) => {
		if (!isShown(question, (id) => shown.get(id))) return false;
		const value = values[question.id];
		if (isAnswered(value)) shown.set(question.id, value);
		return true;
	});
}
