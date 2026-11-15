import {
	type Definition,
	emptyAnswers,
	flow,
	type Question,
	RESERVED_QUESTION_IDS,
	type RepeatSection,
	withAnswer,
} from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import { type ImportOptions, type ImportReport, importTally } from "../src";
import { Ids } from "../src/ids";
import { bakingForm, GROUPS, REASONS, type Slips, STATUS } from "./baking-form";
import { TallyBuilder } from "./tally-builder";

function imported(
	slips: Slips = {},
	options: ImportOptions = {},
): { definition: Definition; report: ImportReport } {
	const result = importTally(bakingForm(slips), options);
	if (!result.ok) throw new Error(result.problems.join("\n"));
	return result;
}

function problems(input: unknown, options: ImportOptions = {}): string[] {
	const result = importTally(input, options);
	return result.ok ? [] : result.problems;
}

function question(definition: Definition, id: string): Question {
	for (const section of definition.sections) {
		const questions =
			section.type === "questions"
				? section.questions
				: [...section.block.status, ...section.block.followUps];
		const found = questions.find((candidate) => candidate.id === id);
		if (found) return found;
	}
	throw new Error(`No question "${id}" in ${definition.sections.map((s) => s.id).join(", ")}`);
}

function breads(definition: Definition): RepeatSection {
	const section = definition.sections.find((candidate) => candidate.type === "repeat");
	if (!section) throw new Error("The breads were not folded");
	return section;
}

describe("importing a Tally form", () => {
	const { definition, report } = imported();

	it("takes the title from the form, and an id from the title", () => {
		expect(definition.title).toBe("Bread at home");
		expect(definition.id).toBe("bread-at-home");
		expect(imported({}, { id: "baking" }).definition.id).toBe("baking");
	});

	it("reads the first page as the consent: its text, then the tick's words", () => {
		expect(report.hasConsent).toBe(true);
		expect(definition.consent?.statement).toBe("I have read this and agree to take part.");
		expect(definition.consent?.text).toEqual([
			[
				{ text: "This is a made-up survey about baking bread at home, which takes " },
				{ text: "about three minutes", bold: true },
				{ text: "." },
			],
			"It has three parts:",
			"- you and your kitchen;",
			"- nine breads;",
			"- last things.",
			[
				{ text: "Please read the " },
				{ text: "consent form", href: "https://example.org/consent" },
				{ text: " first. Questions go to " },
				{ text: "the baker", href: "mailto:baker@example.org" },
				{ text: "." },
			],
		]);
	});

	it("makes a section of each page, titled by its heading", () => {
		expect(report.sections.map(({ id, type, questions }) => [id, type, questions])).toEqual([
			["you-and-your-kitchen", "questions", 9],
			["nine-breads", "repeat", 6],
			["last-things", "questions", 3],
		]);
		expect(definition.sections[0]?.text).toEqual(["A few questions about how you bake."]);
	});

	it("counts what the source held", () => {
		// Per bread: the tick's rule and four more. Then the starter's and the email's.
		expect(report.source).toMatchObject({ pages: 7, rules: 9 * 5 + 2 });
	});

	it("names a question by its code, or by its first words", () => {
		expect(question(definition, "k01").label).toBe("K01: How often do you bake bread?");
		expect(question(definition, "how-old-is-your-starter-in").type).toBe("number");
	});

	it("keeps every kind of question, with its wording and options", () => {
		expect(question(definition, "k01")).toMatchObject({
			type: "single_choice",
			options: [
				{ id: "most-weeks", label: "Most weeks" },
				{ id: "about-once-a-month", label: "About once a month" },
				{ id: "a-few-times-a-year", label: "A few times a year" },
				{ id: "other", label: "Other", specify: true },
			],
		});
		expect(question(definition, "k02")).toMatchObject({
			type: "number",
			placeholder: "Years",
			description: ["Use a decimal for less than a year, such as 0.5."],
		});
		expect(question(definition, "k03")).toMatchObject({ type: "multiple_choice", max: 2 });
		expect(question(definition, "k04")).toMatchObject({
			type: "dropdown",
			options: [
				{ id: "electric-oven", label: "Electric oven" },
				{ id: "gas-oven", label: "Gas oven" },
				{ id: "wood-fired-oven", label: "Wood-fired oven" },
				{ id: "bread-machine", label: "Bread machine" },
			],
		});
		expect(question(definition, "k06")).toMatchObject({
			type: "grid",
			rows: [
				{ id: "kitchen-scale", label: "Kitchen scale" },
				{ id: "thermometer", label: "Thermometer" },
				{ id: "cast-iron-pot", label: "Cast-iron pot" },
			],
			columns: [
				{ id: "never", label: "Never" },
				{ id: "sometimes", label: "Sometimes" },
				{ id: "every-bake", label: "Every bake" },
			],
		});
		expect(question(definition, "k07")).toMatchObject({ type: "ranking" });
		expect(question(definition, "l02")).toMatchObject({ type: "long_text" });
	});

	it("joins a title's run of text fields into one question", () => {
		expect(question(definition, "k05")).toEqual({
			id: "k05",
			type: "fields",
			label: "K05: Which flours are in your kitchen right now?",
			fields: [
				{
					id: "wheat-for-example-strong-white",
					label: "Wheat (for example, strong white)",
					placeholder: "Wheat",
				},
				// Required as Tally had it: this field, not the question and not its neighbours.
				{ id: "rye", label: "Rye", placeholder: "Rye", required: true },
				{ id: "anything-else", label: "Anything else" },
			],
		});
		expect(question(definition, "k05").required).toBeUndefined();
	});

	it("keeps a rule as it is: the question it reads and the option it waits for", () => {
		expect(question(definition, "how-old-is-your-starter-in").showIf).toEqual({
			question: "k08",
			is: "yes",
		});
		expect(question(definition, "may-we-write-to-you-about").showIf).toEqual({
			question: "l01",
			answered: true,
		});
	});

	it("produces a definition the flow can walk", () => {
		const steps = flow(definition, emptyAnswers());
		expect(steps.filter((step) => step.kind === "status")).toHaveLength(9);
		expect(steps.filter((step) => step.kind === "section")).toHaveLength(3);
	});
});

describe("folding the repeated questions", () => {
	const { definition, report } = imported();
	const section = breads(definition);

	it("makes one repeat section of the pages that repeat, introduced by the page of text before them", () => {
		expect(section.title).toBe("Nine breads");
		expect(section.text).toEqual([
			"Next come nine breads in three groups.",
			[
				{ text: "For each one, pick the line that " },
				{ text: "fits you best", bold: true },
				{ text: "." },
			],
		]);
		expect(report.folded).toEqual([
			{ section: "nine-breads", pages: [4, 5, 6], items: 9, settled: [] },
		]);
		expect(report.refused).toEqual([]);
	});

	it("makes a group of each page and an item of each heading", () => {
		expect(section.groups.map((group) => [group.id, group.title, group.items.length])).toEqual([
			["loaves", "Loaves", 4],
			["flatbreads", "Flatbreads", 3],
			["small-bakes", "Small bakes", 2],
		]);
		expect(section.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(
			GROUPS.flatMap((group) => group.breads.map((bread) => bread.code.toLowerCase())),
		);
	});

	it("keeps an item's heading as its label, and what the questions call it as its name", () => {
		expect(section.groups[0]?.items[2]).toEqual({
			id: "b03",
			label: "B03: Rye bread",
			name: "Rye bread",
			definition: "In short: A dense, dark loaf made mostly from rye flour.",
			detail: [
				[
					{ text: "How it is made:", bold: true },
					{ text: " Rye has little gluten, so the loaf rises less and is often baked in a tin." },
				],
				[{ text: "At home: ", bold: true }, { text: "No special equipment is needed." }],
			],
		});
	});

	it("asks the question that has no rule for every item, as a single choice of the grid's columns", () => {
		expect(section.block.status).toEqual([
			{
				id: "have-you-made",
				type: "single_choice",
				label: "Have you made {{item.name}}?",
				options: [
					{ id: "never-made-it", label: STATUS[0] },
					{ id: "made-it-once-or-twice", label: STATUS[1] },
					{ id: "used-to-make-it-but-stopped", label: STATUS[2] },
					{ id: "make-it-now-and-then", label: STATUS[3] },
					{ id: "make-it-most-weeks", label: STATUS[4] },
				],
			},
		]);
		expect(report.sections[1]?.status).toEqual([STATUS]);
	});

	it("keeps the follow-ups in order, with their rules pointing inside the block", () => {
		expect(
			section.block.followUps.map(({ id, type, label, showIf }) => ({ id, type, label, showIf })),
		).toEqual([
			{
				id: "why-did-you-stop-making-choose",
				type: "multiple_choice",
				label: "Why did you stop making {{item.name}}? Choose all that fit.",
				showIf: { question: "have-you-made", is: "used-to-make-it-but-stopped" },
			},
			{
				id: "what-was-the-other-reason",
				type: "short_text",
				label: "What was the other reason?",
				showIf: { question: "why-did-you-stop-making-choose", includes: "another-reason" },
			},
			{
				id: "would-you-make-again",
				type: "single_choice",
				label: "Would you make {{item.name}} again?",
				showIf: { question: "have-you-made", is: "used-to-make-it-but-stopped" },
			},
			{
				id: "what-would-a-better-recipe-for",
				type: "short_text",
				label: "What would a better recipe for {{item.name}} have to fix?",
				showIf: { question: "would-you-make-again", is: "only-with-a-better-recipe" },
			},
			{
				id: "when-did-you-last-make",
				type: "single_choice",
				label: "When did you last make {{item.name}}?",
				// Two of Tally's rules show it, so either is enough.
				showIf: {
					any: [
						{ question: "would-you-make-again", is: "only-with-a-better-recipe" },
						{ question: "would-you-make-again", is: "no" },
					],
				},
			},
		]);
		const why = section.block.followUps[0];
		expect(why?.type === "multiple_choice" && why.options.map((option) => option.label)).toEqual(
			REASONS,
		);
	});

	it("gives the same steps as the source's rules would", () => {
		let answers = emptyAnswers();
		const answer = (id: string, value: Parameters<typeof withAnswer>[3]["value"]) => {
			answers = withAnswer(answers, id, "b03", { value, activeMs: 0, changes: 0 });
		};
		answer("have-you-made", { option: "used-to-make-it-but-stopped" });
		answer("why-did-you-stop-making-choose", { options: ["another-reason"] });
		answer("would-you-make-again", { option: "no" });
		const asked = flow(definition, answers)
			.filter((step) => step.kind === "followUp")
			.map((step) => step.questionId);
		expect(asked).toEqual([
			"why-did-you-stop-making-choose",
			"what-was-the-other-reason",
			"would-you-make-again",
			"when-did-you-last-make",
		]);
	});

	it("says what it changed on the way", () => {
		expect(report.notes).toHaveLength(5);
		expect(report.notes).toEqual(
			expect.arrayContaining([
				"9 grids with a single row became single choices. The row's own label was dropped.",
				"9 rules show a block that is no longer in the form. That part of the rule was left out.",
				'9 ticks that only revealed text became detail behind a "more" control.',
			]),
		);
	});

	it("finds the name inside a heading that says more", () => {
		const longer = breads(imported({ longerHeading: "Naan" }).definition);
		expect(longer.groups[1]?.items[1]).toMatchObject({
			id: "b06",
			label: "B06: Notes on Naan (yeasted)",
			name: "Naan",
		});
		expect(longer.block.status[0]?.label).toBe("Have you made {{item.name}}?");
	});

	it("can be told not to fold", () => {
		const flat = imported({}, { fold: false });
		expect(flat.definition.sections.map((s) => s.type)).toEqual([
			"questions",
			"questions",
			"questions",
			"questions",
			"questions",
			"questions",
		]);
		expect(flat.report.folded).toEqual([]);
		// The page of text stays a section of its own, with no questions.
		expect(flat.report.sections[1]).toMatchObject({ id: "nine-breads", questions: 0 });
		// Six questions for each of the four loaves.
		expect(flat.report.sections[2]).toMatchObject({ id: "loaves", questions: 24 });
	});
});

describe("copies that differ in more than the item's name", () => {
	it("are not folded, and the report says where they differ", () => {
		const { definition, report } = imported({ required: "Naan", placeholder: "Bagels" });
		expect(definition.sections.some((section) => section.type === "repeat")).toBe(false);
		expect(report.folded).toEqual([]);
		expect(report.refused).toEqual([
			{
				pages: [4, 5, 6],
				items: 9,
				differences: [
					{ item: "B08: Bagels", where: "question 5, placeholder", found: "asdf", expected: "" },
					{ item: "B06: Naan", where: "question 4, required", found: "yes", expected: "no" },
				],
			},
		]);
	});

	it("still become a valid form, written out as they were", () => {
		const { definition } = imported({ required: "Naan" });
		const flatbreads = definition.sections.find((section) => section.id === "flatbreads");
		expect(flatbreads?.type === "questions" && flatbreads.questions).toHaveLength(18);
		const again = question(definition, "would-you-make-naan-again");
		expect(again.required).toBe(true);
		// What stood above a question on its page is the text under it now.
		expect(question(definition, "have-you-made-naan")).toMatchObject({
			description: [
				[{ text: "B06: Naan", bold: true }],
				"In short: A soft, leavened flatbread, by tradition baked in a clay oven.",
			],
			detail: [
				[
					{ text: "How it is made:", bold: true },
					{ text: " At home it is cooked in a very hot pan or under a grill." },
				],
				[{ text: "At home: ", bold: true }, { text: "No special equipment is needed." }],
			],
		});
	});

	it("report a wording that differs, with the item's name put back", () => {
		const { report } = imported({ wording: "Brioche" });
		expect(report.refused[0]?.differences).toEqual([
			{
				item: "B04: Brioche",
				where: "question 2, option 2",
				found: "It never turned out well",
				expected: "It rarely turned out well",
			},
		]);
	});

	it("are folded on request, taking what most copies have and listing each place", () => {
		const { definition, report } = imported(
			{ required: "Naan", placeholder: "Bagels", wording: "Brioche" },
			{ acceptDifferences: true },
		);
		const section = breads(definition);
		expect(section.groups.map((group) => group.items.length)).toEqual([4, 3, 2]);
		expect(section.block.followUps[2]?.required).toBeUndefined();
		expect(report.refused).toEqual([]);
		expect(report.folded[0]?.settled.map(({ item, where }) => `${item}: ${where}`)).toEqual([
			"B04: Brioche: question 2, option 2",
			"B08: Bagels: question 5, placeholder",
			"B06: Naan: question 4, required",
		]);
	});

	it("are never folded when one asks other questions, whatever was requested", () => {
		const { definition, report } = imported({ extraQuestion: "Pita" }, { acceptDifferences: true });
		expect(definition.sections.some((section) => section.type === "repeat")).toBe(false);
		expect(report.refused[0]).toMatchObject({
			reason: "Some items do not ask the same questions as the others.",
			differences: [
				{
					item: "B05: Pita",
					where: "its questions",
					found: "7 questions",
					expected: "6 questions",
				},
			],
		});
	});

	it("are not folded when a page holds more than its items", () => {
		const { definition, report } = imported({ textAboveItems: true });
		// The first group's page is not only copies, so the run starts at the second.
		expect(definition.sections.map((section) => [section.id, section.type])).toEqual([
			["you-and-your-kitchen", "questions"],
			["nine-breads", "questions"],
			["loaves", "questions"],
			["flatbreads", "repeat"],
			["last-things", "questions"],
		]);
		expect(report.folded[0]).toMatchObject({ pages: [5, 6], items: 5 });
	});
});

describe("detaching the email", () => {
	it("is off unless asked for", () => {
		expect(question(imported().definition, "l01").detached).toBeUndefined();
	});

	it("marks the email and the question that depends only on it", () => {
		const { definition } = imported({}, { detachEmail: true });
		expect(question(definition, "l01").detached).toBe(true);
		expect(question(definition, "may-we-write-to-you-about").detached).toBe(true);
		expect(question(definition, "l02").detached).toBeUndefined();
	});
});

describe("what cannot be imported", () => {
	it("is refused when it is not a Tally page's data", () => {
		expect(problems({ blocks: "none" })[0]).toContain("This is not a Tally form page's data");
		expect(problems("not json")[0]).toContain("This is not a Tally form page's data");
	});

	it("is refused for a block it has nothing to turn into, counted by type", () => {
		const form = new TallyBuilder();
		form.title("When were you born?");
		form.other("INPUT_DATE");
		form.other("INPUT_DATE");
		form.other("FILE_UPLOAD");
		expect(problems(form.pageData())).toEqual([
			"2 blocks of type INPUT_DATE cannot be imported: Forms has nothing to turn it into yet.",
			"1 block of type FILE_UPLOAD cannot be imported: Forms has nothing to turn it into yet.",
		]);
	});

	it("is refused for a rule that does more than show blocks, or compares in a way Forms cannot", () => {
		const form = new TallyBuilder();
		form.title("How many loaves a week?");
		const loaves = form.input("INPUT_NUMBER");
		const more = form.uuid();
		form.logic([{ field: loaves, comparison: "GREATER_THAN", value: "3" }], [more]);
		const jump = form.logic([{ field: loaves, comparison: "IS", value: "0" }], []);
		jump.payload.actions = [{ type: "JUMP_TO_PAGE", payload: {} }];
		form.title("Who eats them?", { hidden: true });
		form.input("INPUT_TEXT", "", { hidden: true, as: more });
		expect(problems(form.pageData())).toEqual([
			"1 rule uses the comparison GREATER_THAN, which cannot be imported.",
			"1 rule uses the action JUMP_TO_PAGE, which cannot be imported.",
		]);
	});

	it("is refused for a rule that looks at a later answer", () => {
		const form = new TallyBuilder();
		const first = form.uuid();
		form.title("Which flour?", { hidden: true });
		form.input("INPUT_TEXT", "", { hidden: true, as: first });
		form.title("Do you bake?");
		const bakes = form.multipleChoice(["Yes", "No"]);
		form.logic([{ field: bakes.group, comparison: "IS", value: bakes.options[0] ?? "" }], [first]);
		const found = problems(form.pageData());
		expect(found[0]).toBe("The form was read, but what it became is not a valid definition:");
		expect(found[1]).toContain('The rule points at "do-you-bake", which comes later in the form.');
	});

	it("is refused for text that a rule shows, outside a tick that only reveals it", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		const bakes = form.multipleChoice(["Yes", "No"]);
		const note = form.uuid();
		const next = form.uuid();
		form.logic(
			[{ field: bakes.group, comparison: "IS", value: bakes.options[0] ?? "" }],
			[note, next],
		);
		form.text("Then the next question is for you.", { hidden: true, as: note });
		form.title("What do you bake?", { hidden: true });
		form.input("INPUT_TEXT", "", { hidden: true, as: next });
		expect(problems(form.pageData())[0]).toContain(
			'Page 1 has text that a rule shows ("Then the next question is for you.")',
		);
	});
});

describe("smaller things", () => {
	it("reads the data out of a saved page", () => {
		const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(bakingForm())}</script></body></html>`;
		const result = importTally(html);
		expect(result.ok && result.definition.title).toBe("Bread at home");
	});

	it("uses the form's name when it has no title block", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		const result = importTally(form.pageData("Baking, quickly"));
		expect(result.ok && [result.definition.title, result.definition.id]).toEqual([
			"Baking, quickly",
			"baking-quickly",
		]);
	});

	it("leaves out a hidden question that no rule shows, and says so", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		form.title("An abandoned question", { hidden: true });
		form.input("INPUT_TEXT", "", { hidden: true });
		const result = importTally(form.pageData());
		if (!result.ok) throw new Error(result.problems.join("\n"));
		expect(result.report.sections[0]?.questions).toBe(1);
		expect(result.report.notes).toContain("1 hidden block that no rule shows was left out.");
	});

	it("turns a thank-you page into the form's end", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		form.pageBreak(undefined, true);
		form.heading(1, "Thank you");
		form.text("Enjoy your bread.");
		const result = importTally(form.pageData());
		expect(result.ok && result.definition.end).toEqual({
			title: "Thank you",
			text: ["Enjoy your bread."],
		});
	});

	it("numbers ids that would repeat", () => {
		const form = new TallyBuilder();
		form.title("Anything else?");
		form.input("INPUT_TEXT");
		form.title("Anything else?");
		form.multipleChoice(["No", "No"]);
		const result = importTally(form.pageData());
		if (!result.ok) throw new Error(result.problems.join("\n"));
		const [first, second] =
			result.definition.sections[0]?.type === "questions"
				? result.definition.sections[0].questions
				: [];
		expect([first?.id, second?.id]).toEqual(["anything-else", "anything-else-2"]);
		expect(second?.type === "single_choice" && second.options.map((option) => option.id)).toEqual([
			"no",
			"no-2",
		]);
	});
});

describe("the ids the importer hands out", () => {
	it("are never ones the export of responses needs for its own columns", () => {
		const ids = new Ids(RESERVED_QUESTION_IDS);
		expect(ids.take("Device", "question")).toBe("device-2");
		expect(ids.take("Device", "question")).toBe("device-3");
		expect(ids.take("Completed?", "question")).toBe("completed-2");
		expect(ids.take("Your kitchen", "question")).toBe("your-kitchen");
	});

	it("give a question titled like one of those columns another id", () => {
		const tally = new TallyBuilder();
		tally.formTitle("A made-up form");
		tally.title("Device");
		tally.input("INPUT_TEXT");
		const result = importTally({ blocks: tally.blocks }, { id: "made-up" });
		if (!result.ok) throw new Error(result.problems.join("\n"));
		const [section] = result.definition.sections;
		expect(section?.type === "questions" && section.questions.map(({ id }) => id)).toEqual([
			"device-2",
		]);
	});
});
