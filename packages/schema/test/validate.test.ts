import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDefinition } from "../src";
import { problemsOf, questionsSection, repeatSection, teaForm, valid } from "./forms";

describe("a valid definition", () => {
	it("parses, and fills in what was left out", () => {
		const form = teaForm();
		repeatSection(form, "teas").block = { status: repeatSection(form, "teas").block.status };
		const definition = valid(form);
		const teas = definition.sections[1];
		expect(teas?.type === "repeat" && teas.block.followUps).toEqual([]);
	});

	it("is what every example in the repository is", () => {
		const examples = new URL("../../../examples/", import.meta.url);
		const files = readdirSync(examples).filter((name) => name.endsWith(".json"));
		expect(files).toContain("home-baking.json");
		for (const file of files) {
			const example = JSON.parse(readFileSync(new URL(file, examples), "utf8"));
			expect(problemsOf(example), file).toEqual([]);
			// A form's file is named after its id, so that its address can be read off the folder.
			expect(`${example.id}.json`).toBe(file);
		}
	});
});

describe("the shape of a definition", () => {
	it("names the place of a mistake by the ids on the way to it", () => {
		const form = teaForm() as unknown as {
			sections: Array<{ questions: Array<{ label: unknown }> }>;
		};
		const cups = form.sections[0]?.questions[1];
		if (cups) cups.label = 5;
		expect(problemsOf(form)).toEqual([
			'sections[0] "you" › questions[1] "cups" › label: Invalid input: expected string, received number',
		]);
	});

	it("says which question types there are when one is unknown", () => {
		const form = teaForm() as unknown as {
			sections: Array<{ questions: Array<{ type: string }> }>;
		};
		const cups = form.sections[0]?.questions[1];
		if (cups) cups.type = "slider";
		const [problem] = problemsOf(form);
		expect(problem).toContain(
			'sections[0] "you" › questions[1] "cups": "slider" is not a question type',
		);
		expect(problem).toContain("short_text, long_text, number");
	});

	it("says what a rule can be when one is malformed", () => {
		const form = teaForm() as unknown as {
			sections: Array<{ questions: Array<{ showIf: unknown }> }>;
		};
		const cups = form.sections[0]?.questions[1];
		if (cups) cups.showIf = { question: "drinks", equals: "yes" };
		const [problem] = problemsOf(form);
		expect(problem).toContain('questions[1] "cups" › showIf: A rule is one of { question, is }');
	});

	it("refuses a key it does not know, so a typo is not silently dropped", () => {
		const form = { ...teaForm(), titel: "Tea" };
		expect(problemsOf(form)).toEqual(['the form: Unrecognized key: "titel"']);
	});

	it("refuses an id that would not survive an address or a column name", () => {
		const form = teaForm();
		form.id = "Tea Form";
		expect(problemsOf(form)[0]).toContain("id: An id is lowercase letters, digits, - and _");
	});

	it("refuses a link that could run script", () => {
		const form = teaForm();
		form.consent = {
			text: [[{ text: "Read the terms", href: "javascript:alert(1)" }]],
			statement: "I agree.",
		};
		expect(problemsOf(form)[0]).toContain("A link has to start with https://, http:// or mailto:");
	});

	it("reports every problem, not only the first", () => {
		const form = teaForm() as unknown as { title: unknown; id: unknown };
		form.title = "";
		form.id = "";
		expect(problemsOf(form)).toHaveLength(2);
	});
});

describe("ids", () => {
	it("refuses a question id used twice, anywhere in the form", () => {
		const form = teaForm();
		questionsSection(form, "last").questions.push({
			id: "tried",
			type: "short_text",
			label: "Again?",
		});
		expect(problemsOf(form)).toEqual([
			'the form: The question id "tried" is used more than once. Answers are stored under these ids, so each question in the form needs its own.',
		]);
	});

	it("refuses an item id used twice, across groups", () => {
		const form = teaForm();
		repeatSection(form, "teas").groups[1]?.items.push({ id: "assam", label: "Assam again" });
		expect(problemsOf(form)[0]).toContain('The item id "assam" is used more than once');
	});

	it("refuses an option id used twice in one question", () => {
		const form = teaForm();
		const drinks = questionsSection(form, "you").questions[0];
		if (drinks?.type === "single_choice") drinks.options.push({ id: "yes", label: "Yes, a lot" });
		expect(problemsOf(form)).toEqual([
			'sections[0] "you" › questions[0] "drinks": The option id "yes" is used more than once.',
		]);
	});

	it("refuses a section id used twice", () => {
		const form = teaForm();
		questionsSection(form, "last").id = "you";
		expect(problemsOf(form)[0]).toContain('The section id "you" is used more than once');
	});
});

describe("rules", () => {
	function withRule(showIf: unknown, section = "you", index = 2) {
		const form = teaForm();
		const question = questionsSection(form, section).questions[index] as { showIf?: unknown };
		question.showIf = showIf;
		return problemsOf(form);
	}

	it("refuses a rule that points at no question", () => {
		expect(withRule({ question: "coffee", is: "yes" })).toEqual([
			'sections[0] "you" › questions[2] "additions" › showIf: The rule points at "coffee", which is not a question in this form.',
		]);
	});

	it("refuses a rule that points forward, and says how to fix it", () => {
		const [problem] = withRule({ question: "comments", answered: true });
		expect(problem).toContain('The rule points at "comments", which comes later in the form.');
		expect(problem).toContain("move this question after it, or change the rule");
	});

	it("refuses a rule that points at its own question", () => {
		expect(withRule({ question: "additions", includes: "milk" })[0]).toContain(
			"The rule points at its own question.",
		);
	});

	it("finds a bad reference inside any, all and not", () => {
		const problems = withRule({
			any: [
				{ question: "drinks", is: "yes" },
				{ not: { all: [{ question: "nope", answered: true }] } },
			],
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('"nope"');
	});

	it("refuses an option the question does not have, and lists the ones it has", () => {
		expect(withRule({ question: "drinks", is: "maybe" })).toEqual([
			'sections[0] "you" › questions[2] "additions" › showIf: "drinks" has no option "maybe". Its options are "yes", "no".',
		]);
	});

	it("refuses `is` on a multiple choice and `includes` on a single choice", () => {
		expect(withRule({ question: "additions", is: "milk" }, "last", 0)[0]).toContain(
			'Use "includes" instead of "is"',
		);
		expect(withRule({ question: "drinks", includes: "yes" })[0]).toContain(
			'"includes" is for a multiple choice or a ranking',
		);
	});

	it("refuses a number compared with text", () => {
		expect(withRule({ question: "cups", is: "three" })[0]).toContain(
			'"cups" is a number, so compare it with a number',
		);
	});

	it("asks for the row of a grid, and knows its rows and columns", () => {
		const form = teaForm();
		const questions = questionsSection(form, "last").questions;
		questions.unshift({
			id: "times",
			type: "grid",
			label: "When do you drink it?",
			rows: [
				{ id: "morning", label: "Morning" },
				{ id: "evening", label: "Evening" },
			],
			columns: [
				{ id: "yes", label: "Yes" },
				{ id: "no", label: "No" },
			],
		});
		const comments = questions[1] as { showIf?: unknown };
		comments.showIf = { question: "times", is: "yes" };
		expect(problemsOf(form)[0]).toContain("the rule has to name a row: { question, row, is }");
		comments.showIf = { question: "times", row: "noon", is: "yes" };
		expect(problemsOf(form)[0]).toContain(
			'"times" has no row "noon". Its rows are "morning", "evening".',
		);
		comments.showIf = { question: "times", row: "morning", is: "often" };
		expect(problemsOf(form)[0]).toContain('"times" has no column "often"');
		comments.showIf = { question: "times", row: "morning", is: "yes" };
		expect(problemsOf(form)).toEqual([]);
	});

	it("refuses a rule outside a repeat section that points into one", () => {
		const [problem] = withRule({ question: "tried", is: "drink" }, "last", 0);
		expect(problem).toContain('a question asked for each item of the repeat section "teas"');
		expect(problem).toContain("no telling which item's answer is meant");
	});

	it("lets a block's rule read an answer from before the repeat section", () => {
		const form = teaForm();
		const why = repeatSection(form, "teas").block.followUps?.[0] as { showIf?: unknown };
		why.showIf = {
			all: [
				{ question: "tried", is: "gave-up" },
				{ question: "drinks", is: "yes" },
			],
		};
		expect(problemsOf(form)).toEqual([]);
	});

	it("refuses a status question that looks at a follow-up", () => {
		const form = teaForm();
		const tried = repeatSection(form, "teas").block.status[0] as { showIf?: unknown };
		tried.showIf = { question: "again", is: "yes" };
		expect(problemsOf(form)[0]).toContain(
			'The rule points at "again", which comes later in the form.',
		);
	});
});

describe("detached questions", () => {
	it("refuses an ordinary question that depends on a detached answer", () => {
		const form = teaForm();
		const questions = questionsSection(form, "last").questions;
		questions.push({
			id: "newsletter",
			type: "single_choice",
			label: "And a newsletter?",
			showIf: { question: "email", answered: true },
			options: [{ id: "yes", label: "Yes" }],
		});
		const [problem] = problemsOf(form);
		expect(problem).toContain('The rule points at "email", whose answer is detached');
		expect(problem).toContain("Detach this question too, or change the rule.");
	});

	it("refuses a detached question that depends on the response", () => {
		const form = teaForm();
		const email = questionsSection(form, "last").questions[1] as { showIf?: unknown };
		email.showIf = { question: "drinks", is: "yes" };
		expect(problemsOf(form)[0]).toContain(
			'Its rule can only look at other detached questions, and "drinks" is not one.',
		);
	});

	it("refuses a detached question in a block", () => {
		const form = teaForm();
		const again = repeatSection(form, "teas").block.followUps?.[2];
		if (again) again.detached = true;
		expect(problemsOf(form)[0]).toContain("A block's question cannot be detached");
	});
});

describe("a repeat section's block", () => {
	it("refuses a status question that one tap cannot answer", () => {
		const form = teaForm();
		repeatSection(form, "teas").block.status.push({
			id: "since",
			type: "number",
			label: "Since which year?",
		});
		expect(problemsOf(form)).toEqual([
			'sections[1] "teas" › block › status[1] "since": A status question is answered with one tap on a card, so it has to be a single choice; this one is a number. Move it to "followUps" or change its type.',
		]);
	});

	it("refuses a merge field it cannot fill", () => {
		const form = teaForm();
		const tried = repeatSection(form, "teas").block.status[0];
		if (tried) tried.label = "Have you tried {{item.title}}?";
		expect(problemsOf(form)[0]).toContain(
			'"{{item.title}}" is not a merge field. A block\'s question can use {{item.label}} and {{item.name}}.',
		);
	});

	it("refuses a merge field outside a block", () => {
		const form = teaForm();
		const drinks = questionsSection(form, "you").questions[0];
		if (drinks) drinks.label = "Do you drink {{item.label}}?";
		expect(problemsOf(form)[0]).toContain(
			"merge fields work only in the questions of a repeat section's block",
		);
	});

	it("lets the follow-ups' introduction use the count and nothing else", () => {
		const form = teaForm();
		repeatSection(form, "teas").block.followUpsIntro = "About {{item.label}}";
		expect(problemsOf(form)[0]).toContain('"{{item.label}}" is not a merge field here');
	});
});

describe("limits inside a question", () => {
	it("refuses a maximum above the number of options", () => {
		const form = teaForm();
		const additions = questionsSection(form, "you").questions[2];
		if (additions?.type === "multiple_choice") additions.max = 9;
		expect(problemsOf(form)[0]).toContain('"max" is 9, but there are only 4 options.');
	});

	it("refuses a minimum above the maximum", () => {
		const form = teaForm();
		const cups = questionsSection(form, "you").questions[1];
		if (cups?.type === "number") cups.max = -1;
		expect(problemsOf(form)[0]).toContain('"min" (0) is above "max" (-1).');
	});
});

describe("parseDefinition", () => {
	it("answers with problems instead of throwing on anything at all", () => {
		for (const input of [null, 7, "form", [], {}]) {
			const result = parseDefinition(input);
			expect(result.ok).toBe(false);
		}
	});
});
