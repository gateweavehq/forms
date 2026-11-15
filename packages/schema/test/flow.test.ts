import { describe, expect, it } from "vitest";
import {
	type AnswerValue,
	detachedQuestionsShown,
	emptyAnswers,
	flow,
	type ResponseAnswers,
	unansweredRequired,
	withAnswer,
} from "../src";
import { questionsSection, repeatSection, teaForm, valid } from "./forms";

const definition = valid(teaForm());

/** Answers from a short description: `{ drinks: ... }` and `{ assam: { tried: ... } }`. */
function answering(
	questions: Record<string, AnswerValue | null>,
	items: Record<string, Record<string, AnswerValue | null>> = {},
): ResponseAnswers {
	let answers = emptyAnswers();
	for (const [question, value] of Object.entries(questions)) {
		answers = withAnswer(answers, question, undefined, { value, activeMs: 0, changes: 0 });
	}
	for (const [item, own] of Object.entries(items)) {
		for (const [question, value] of Object.entries(own)) {
			answers = withAnswer(answers, question, item, { value, activeMs: 0, changes: 0 });
		}
	}
	return answers;
}

function keys(answers: ResponseAnswers): string[] {
	return flow(definition, answers).map((step) => step.key);
}

describe("the flow of a form", () => {
	it("starts each leg with its title, and asks what has no rule", () => {
		expect(keys(emptyAnswers())).toEqual([
			"s:you",
			"q:drinks",
			"q:additions",
			"s:teas",
			"i:assam:tried",
			"i:earl-grey:tried",
			"i:sencha:tried",
			"i:matcha:tried",
			"i:gunpowder:tried",
			"s:last",
			"q:comments",
		]);
	});

	it("shows a question once its rule holds", () => {
		expect(keys(answering({ drinks: { option: "yes" } }))).toContain("q:cups");
		expect(keys(answering({ drinks: { option: "no" } }))).not.toContain("q:cups");
	});

	it("asks a group's status questions first, then the follow-ups of the items that have any", () => {
		const answers = answering(
			{},
			{ assam: { tried: { option: "gave-up" } }, "earl-grey": { tried: { option: "drink" } } },
		);
		expect(keys(answers).slice(3, 9)).toEqual([
			"s:teas",
			"i:assam:tried",
			"i:earl-grey:tried",
			"f:black",
			"i:assam:gave-up-why",
			"i:assam:again",
		]);
	});

	it("counts the items with follow-ups in the introduction, per group", () => {
		const answers = answering(
			{},
			{
				assam: { tried: { option: "gave-up" } },
				sencha: { tried: { option: "gave-up" } },
				gunpowder: { tried: { option: "gave-up" } },
			},
		);
		const intros = flow(definition, answers).filter((step) => step.kind === "followUpsIntro");
		expect(intros.map((step) => [step.groupId, step.count])).toEqual([
			["black", 1],
			["green", 2],
		]);
	});

	it("has no follow-up step for a group where nothing matched", () => {
		const answers = answering({}, { assam: { tried: { option: "drink" } } });
		expect(keys(answers).some((key) => key.startsWith("f:"))).toBe(false);
	});

	it("applies the rules inside the chain to the same item's answers", () => {
		const answers = answering(
			{},
			{
				assam: { tried: { option: "gave-up" }, "gave-up-why": { options: ["other"] } },
				sencha: { tried: { option: "gave-up" }, "gave-up-why": { options: ["taste"] } },
			},
		);
		const all = keys(answers);
		expect(all).toContain("i:assam:gave-up-other");
		expect(all).not.toContain("i:sencha:gave-up-other");
	});

	it("counts a hidden question as unanswered, so changing an answer closes what hung on it", () => {
		const answers = answering(
			{},
			{
				// The status was changed after the follow-ups were answered: their answers remain
				// stored, and must not keep the chain open.
				assam: { tried: { option: "drink" }, "gave-up-why": { options: ["other"] } },
			},
		);
		const all = keys(answers);
		expect(all).not.toContain("i:assam:gave-up-why");
		expect(all).not.toContain("i:assam:gave-up-other");
	});

	it("says where a step is: which leg, which group, which item", () => {
		const answers = answering({}, { matcha: { tried: { option: "gave-up" } } });
		const steps = flow(definition, answers);
		const status = steps.find((step) => step.key === "i:matcha:tried");
		expect(status).toMatchObject({ leg: 2, legs: 3, group: 2, groups: 2, item: 2, items: 3 });
		const followUp = steps.find((step) => step.key === "i:matcha:again");
		expect(followUp).toMatchObject({ kind: "followUp", group: 2, item: 1, items: 1 });
	});

	it("leaves detached questions out: they are asked at the end, apart", () => {
		const all = keys(answering({ email: "someone@example.test" }));
		expect(all).not.toContain("q:email");
		expect(all).not.toContain("q:contact");
	});

	it("never changes the steps before the one being answered", () => {
		const before = keys(answering({}, { assam: { tried: { option: "gave-up" } } }));
		const after = keys(
			answering({}, { assam: { tried: { option: "gave-up" }, again: { option: "yes" } } }),
		);
		const at = before.indexOf("i:assam:again");
		expect(after.slice(0, at + 1)).toEqual(before.slice(0, at + 1));
	});
});

describe("required questions", () => {
	const form = teaForm();
	const drinks = questionsSection(form, "you").questions[0];
	if (drinks) drinks.required = true;
	const why = repeatSection(form, "teas").block.followUps?.[0];
	if (why) why.required = true;
	const strict = valid(form);

	it("lists the required questions that are shown and have no answer", () => {
		const answers = answering({}, { assam: { tried: { option: "gave-up" } } });
		expect(unansweredRequired(strict, answers).map((step) => step.key)).toEqual([
			"q:drinks",
			"i:assam:gave-up-why",
		]);
	});

	it("counts a question that was seen and left empty as unanswered", () => {
		const answers = answering({ drinks: null });
		expect(unansweredRequired(strict, answers).map((step) => step.key)).toEqual(["q:drinks"]);
	});

	it("is satisfied once they are answered, and ignores required questions that are hidden", () => {
		const answers = answering(
			{ drinks: { option: "no" } },
			{ assam: { tried: { option: "drink" } } },
		);
		expect(unansweredRequired(strict, answers)).toEqual([]);
	});
});

describe("detached questions", () => {
	it("are shown by their own rules, which look only at each other", () => {
		const ids = (values: Record<string, AnswerValue | null>) =>
			detachedQuestionsShown(definition, values).map((question) => question.id);
		expect(ids({})).toEqual(["email"]);
		expect(ids({ email: "someone@example.test" })).toEqual(["email", "contact"]);
		expect(ids({ email: "" })).toEqual(["email"]);
	});
});
