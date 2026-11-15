import { describe, expect, it } from "vitest";
import { type AnswerValue, emptyAnswers, flow, type ResponseAnswers, withAnswer } from "../src";
import { repeatSection, teaForm, valid } from "./forms";

/** The tea form with its first follow-up shown by this rule. */
function withFollowUpRule(showIf: unknown) {
	const form = teaForm();
	const { block } = repeatSection(form, "teas");
	const [why] = block.followUps ?? [];
	block.followUps = why ? [{ ...why, showIf } as typeof why] : [];
	return valid(form);
}

function statuses(values: Record<string, AnswerValue | null>): ResponseAnswers {
	let answers = emptyAnswers();
	for (const [item, value] of Object.entries(values)) {
		answers = withAnswer(answers, "tried", item, { value, activeMs: 0, changes: 0 });
	}
	return answers;
}

function followedUp(definition: ReturnType<typeof valid>, answers: ResponseAnswers): string[] {
	return flow(definition, answers).flatMap((step) =>
		step.kind === "followUp" ? [step.itemId] : [],
	);
}

// "isNot" holds for anything else, a missing answer included. That is what the words say, and
// it has a consequence in a repeat section that a form's author has to know about.
describe("a follow-up shown when the status is not some answer", () => {
	const answers = statuses({
		assam: { option: "never" },
		"earl-grey": { option: "drink" },
		// Shown and passed without an answer.
		sencha: null,
		// Matcha and gunpowder have not been reached at all.
	});

	it("is asked of an item whose status was passed, and of one not answered yet", () => {
		const definition = withFollowUpRule({ question: "tried", isNot: "never" });
		expect(followedUp(definition, answers)).toEqual(["earl-grey", "sencha", "matcha", "gunpowder"]);
	});

	it("is asked only of answered items when the rule also says so", () => {
		const definition = withFollowUpRule({
			all: [
				{ question: "tried", answered: true },
				{ question: "tried", isNot: "never" },
			],
		});
		expect(followedUp(definition, answers)).toEqual(["earl-grey"]);
	});

	it("is never asked of a passed item under `is`, which a missing answer cannot satisfy", () => {
		const definition = withFollowUpRule({ question: "tried", is: "drink" });
		expect(followedUp(definition, answers)).toEqual(["earl-grey"]);
	});
});
