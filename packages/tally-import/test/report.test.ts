import { describe, expect, it } from "vitest";
import { importTally } from "../src";
import { decodeEntities } from "../src/rich-text";
import { bakingForm } from "./baking-form";
import { TallyBuilder } from "./tally-builder";

function notesOf(input: unknown): string[] {
	const result = importTally(input);
	if (!result.ok) throw new Error(result.problems.join("\n"));
	return result.report.notes;
}

describe("what the report says was left out or changed", () => {
	it("names every text input that was joined to the question above it", () => {
		expect(notesOf(bakingForm())).toContain(
			"2 text inputs with no title of their own were joined to the question above as further fields, labelled by the line of text above each.",
		);
	});

	it("names the settings of blocks that are set and were not read, by block type", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		const options = form.multipleChoice(["Yes", "No"]);
		for (const block of form.blocks) {
			if (block.groupUuid !== options.group) continue;
			// Off, empty and absent say nothing. Only these two are set to something.
			Object.assign(block.payload, {
				hasBadge: true,
				badgeType: "LETTERS",
				colorCodeOptions: false,
				hasDefaultAnswer: false,
				defaultAnswer: null,
			});
		}
		form.pageBreak();
		form.blocks[form.blocks.length - 1]?.payload &&
			Object.assign(form.blocks[form.blocks.length - 1]?.payload ?? {}, { isFolded: true });
		form.title("Why?");
		form.input("TEXTAREA");
		expect(notesOf(form.pageData())).toContain(
			"Settings of blocks that are set and were not read: MULTIPLE_CHOICE_OPTION: badgeType, hasBadge; PAGE_BREAK: isFolded.",
		);
	});

	it("says nothing about block settings when none is set", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		expect(notesOf(form.pageData()).join(" ")).not.toContain("Settings of blocks");
	});

	it("names the form's own settings, which are not imported", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		const data = form.pageData() as { props: { pageProps: { settings: unknown } } };
		data.props.pageProps.settings = {
			language: "en",
			hasProgressBar: true,
			saveForLater: true,
			isClosed: false,
			closeDate: null,
			redirectOnCompletion: null,
		};
		expect(notesOf(data)).toContain(
			"The form's own settings are not imported (its language, look, closing, progress bar and the like): hasProgressBar, language, saveForLater.",
		);
	});

	it("says so when a rule has no condition, and leaves it out", () => {
		const form = new TallyBuilder();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		const next = form.uuid();
		form.logic([], [next]);
		form.title("What do you bake?");
		form.input("INPUT_TEXT", "", { as: next });
		const result = importTally(form.pageData());
		if (!result.ok) throw new Error(result.problems.join("\n"));
		expect(result.report.notes).toContain(
			"1 rule has no condition, so nothing says when it applies. It was left out.",
		);
		expect(result.report.sections[0]?.questions).toBe(2);
	});
});

describe("a rule that depends on something that is not a question", () => {
	it("is a problem, not an exception, when it reads the consent tick", () => {
		const form = new TallyBuilder();
		form.text("About this form.");
		const consent = form.checkboxes(["I agree to take part."], { required: true });
		form.pageBreak();
		form.title("Do you bake?");
		form.multipleChoice(["Yes", "No"]);
		const next = form.uuid();
		form.logic(
			[{ field: consent.group, comparison: "CONTAINS", value: consent.options[0] ?? "" }],
			[next],
		);
		form.title("What do you bake?", { hidden: true });
		form.input("INPUT_TEXT", "", { hidden: true, as: next });
		const result = importTally(form.pageData());
		expect(result.ok).toBe(false);
		expect(!result.ok && result.problems).toEqual([
			'A rule depends on the answer to something that did not become a question ("I agree to take part."): the consent tick, a tick that only reveals text, or a hidden question that nothing shows. A definition\'s rule can only look at a question.',
		]);
	});

	it("is a problem when it reads a hidden question that nothing shows", () => {
		const form = new TallyBuilder();
		form.title("An abandoned question", { hidden: true });
		const abandoned = form.multipleChoice(["Yes", "No"], { hidden: true });
		const next = form.uuid();
		form.logic(
			[{ field: abandoned.group, comparison: "IS", value: abandoned.options[0] ?? "" }],
			[next],
		);
		form.title("What do you bake?", { hidden: true });
		form.input("INPUT_TEXT", "", { hidden: true, as: next });
		form.title("Anything else?");
		form.input("TEXTAREA");
		const result = importTally(form.pageData());
		expect(result.ok).toBe(false);
		expect(!result.ok && result.problems[0]).toContain('("An abandoned question")');
	});
});

describe("an HTML entity that names no character", () => {
	it("stays as written, and the rest is read", () => {
		expect(decodeEntities("a &#99999999; b &#x110000; c &#xD800; d &amp; e")).toBe(
			"a &#99999999; b &#x110000; c &#xD800; d & e",
		);
	});

	it("does not stop an import", () => {
		const form = new TallyBuilder();
		form.title("Do you bake &#99999999; bread?");
		form.multipleChoice(["Yes &#x110000;", "No"]);
		const result = importTally(form.pageData());
		expect(result.ok && result.definition.sections[0]).toMatchObject({
			questions: [{ label: "Do you bake &#99999999; bread?" }],
		});
	});
});
