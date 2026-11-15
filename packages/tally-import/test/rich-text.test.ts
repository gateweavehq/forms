import { describe, expect, it } from "vitest";
import { Ids, slug } from "../src/ids";
import { decodeEntities, oneLine, richText } from "../src/rich-text";
import { bold, link, paragraph } from "./tally-builder";

describe("Tally's formatted text", () => {
	it("is nothing when it holds no words", () => {
		expect(richText([])).toBeUndefined();
		expect(richText([["", [["tag", "br"]]]])).toBeUndefined();
		expect(richText(undefined)).toBeUndefined();
	});

	it("keeps a plain run as plain text", () => {
		expect(richText([["Just words."]])).toEqual(["Just words."]);
	});

	it("keeps bold, italic and links as spans", () => {
		expect(
			richText([
				["Read "],
				bold("this"),
				[" and "],
				["that", [["font-style", "italic"]]],
				[" on "],
				link("the page", "https://example.org/a"),
			]),
		).toEqual([
			[
				{ text: "Read " },
				{ text: "this", bold: true },
				{ text: " and " },
				{ text: "that", italic: true },
				{ text: " on " },
				{ text: "the page", href: "https://example.org/a" },
			],
		]);
	});

	it("starts a paragraph at every block tag, however deep", () => {
		const nested = [
			["A list:"],
			[[[" - one", [["tag", "span"]]]], [["tag", "div"]]],
			[[[[[" - two"]], [["tag", "span"]]]], [["tag", "div"]]],
			paragraph(["Then a paragraph."]),
		];
		expect(richText(nested)).toEqual(["A list:", "- one", "- two", "Then a paragraph."]);
	});

	it("keeps a line break inside a paragraph and drops one at its end", () => {
		expect(richText([["One"], ["", [["tag", "br"]]], ["two"], ["", [["tag", "br"]]]])).toEqual([
			"One\ntwo",
		]);
	});

	it("decodes entities, and reads a non-breaking space as a space", () => {
		expect(decodeEntities("salt&nbsp;&amp; pepper &lt;3 &#39;now&#x27; &unknown;")).toBe(
			"salt & pepper <3 'now' &unknown;",
		);
		expect(richText([["Bread&nbsp;"], bold("and"), ["&nbsp;butter"]])).toEqual([
			[{ text: "Bread " }, { text: "and", bold: true }, { text: " butter" }],
		]);
	});

	it("keeps the words of a link that is not a web or mail address, without its target", () => {
		expect(richText([link("click", "javascript:alert(1)")])).toEqual(["click"]);
	});

	it("reads a label on one line", () => {
		expect(oneLine(richText([["Have you made"], ["", [["tag", "br"]]], [" rye bread?"]]))).toBe(
			"Have you made rye bread?",
		);
	});
});

describe("ids from labels", () => {
	it("uses a leading code when the label has one", () => {
		expect(slug("K01: How often do you bake?")).toBe("k01");
		expect(slug("B2. Rye bread")).toBe("b2");
	});

	it("uses the first words otherwise, within what an id may hold", () => {
		expect(slug("Would you make it again?")).toBe("would-you-make-it-again");
		expect(slug("It's a crème brûlée, isn't it?")).toBe("its-a-creme-brulee-isnt-it");
		expect(slug("One two three four five six seven eight")).toBe("one-two-three-four-five-six");
		expect(slug("?")).toBe("");
	});

	it("numbers the ones that would repeat, and falls back for a label without letters", () => {
		const ids = new Ids();
		expect(ids.take("Yes", "option-1")).toBe("yes");
		expect(ids.take("Yes!", "option-2")).toBe("yes-2");
		expect(ids.take("???", "option-3")).toBe("option-3");
	});
});
