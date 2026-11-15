import { readFileSync } from "node:fs";
import {
	type Definition,
	emptyAnswers,
	flow,
	parseDefinition,
	type ResponseAnswers,
	withAnswer,
} from "@gateweave/forms-schema";
import { describe, expect, it } from "vitest";
import { asks, deckOf, positionOf } from "./deck";

function example(): Definition {
	const file = new URL("../../../../examples/home-baking.json", import.meta.url);
	const parsed = parseDefinition(JSON.parse(readFileSync(file, "utf8")));
	if (!parsed.ok) throw new Error("The example is not a valid definition");
	return parsed.definition;
}

const stopped = (answers: ResponseAnswers, item: string) =>
	withAnswer(answers, "made", item, { value: { option: "stopped" }, activeMs: 0, changes: 0 });

describe("the cards of a form", () => {
	const definition = example();

	it("keeps the flow's steps, in the flow's order", () => {
		const steps = flow(definition, stopped(emptyAnswers(), "rye-bread"));
		const cards = deckOf(steps);
		expect(cards.filter((card) => card.kind !== "review" && card.kind !== "groupOpening")).toEqual(
			steps,
		);
	});

	it("looks back after a group's last item, before anything that follows from its answers", () => {
		const keys = deckOf(flow(definition, stopped(emptyAnswers(), "rye-bread"))).map(
			(card) => card.key,
		);
		const review = keys.indexOf("r:loaves");
		expect(keys[review - 1]).toBe("i:brioche:made");
		expect(keys[review + 1]).toBe("f:loaves");
		// One for each group, and none anywhere else.
		expect(keys.filter((key) => key.startsWith("r:"))).toEqual([
			"r:loaves",
			"r:flatbreads",
			"r:small-bakes",
		]);
	});

	it("opens every group but the first, whose opening is the part's own card", () => {
		const keys = deckOf(flow(definition, emptyAnswers())).map((card) => card.key);
		expect(keys.filter((key) => key.startsWith("g:"))).toEqual(["g:flatbreads", "g:small-bakes"]);
		expect(keys[keys.indexOf("g:flatbreads") - 1]).toBe("r:loaves");
		expect(keys[keys.indexOf("g:flatbreads") + 1]).toBe("i:pita:made");
	});

	it("saves a step of the flow as the position of a card that is not one", () => {
		const cards = deckOf(flow(definition, emptyAnswers()));
		const positions = new Set(flow(definition, emptyAnswers()).map((step) => step.key));
		for (const card of cards) expect(positions.has(positionOf(card))).toBe(true);
		const review = cards.find((card) => card.key === "r:loaves");
		const opening = cards.find((card) => card.key === "g:flatbreads");
		expect(review && positionOf(review)).toBe("i:brioche:made");
		expect(opening && positionOf(opening)).toBe("i:pita:made");
	});

	it("asks nothing on the cards it adds", () => {
		const added = deckOf(flow(definition, emptyAnswers())).filter(
			(card) => card.kind === "review" || card.kind === "groupOpening",
		);
		expect(added).toHaveLength(5);
		expect(added.some(asks)).toBe(false);
	});
});
