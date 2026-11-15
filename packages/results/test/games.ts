import {
	type AnswerValue,
	type Definition,
	emptyAnswers,
	formatProblems,
	parseDefinition,
	withAnswer,
} from "@gateweave/forms-schema";
import type { Device, ResponseRecord } from "../src";

/**
 * A made-up form about board games and eight made-up responses to it, small enough that every
 * number the tests expect can be worked out with a pencil. The comments beside the responses
 * are that working.
 */
function parsed(input: unknown): Definition {
	const result = parseDefinition(input);
	if (!result.ok) throw new Error(formatProblems(result.problems));
	return result.definition;
}

export const games = parsed({
	version: 1,
	id: "board-games",
	title: "Board games",
	sections: [
		{
			type: "questions",
			id: "you",
			title: "You",
			questions: [
				{
					id: "plays",
					type: "single_choice",
					label: "How often do you play?",
					options: [
						{ id: "weekly", label: "Most weeks" },
						{ id: "monthly", label: "About once a month" },
						{ id: "rarely", label: "Rarely" },
					],
				},
				{ id: "owned", type: "number", label: "How many games do you own?", min: 0 },
				{
					id: "likes",
					type: "multiple_choice",
					label: "Which kinds do you like?",
					options: [
						{ id: "strategy", label: "Strategy" },
						{ id: "party", label: "Party" },
						{ id: "coop", label: "Cooperative" },
						{ id: "other", label: "Something else", specify: true },
					],
				},
			],
		},
		{
			type: "repeat",
			id: "games",
			title: "Five games",
			groups: [
				{
					id: "classics",
					title: "Classics",
					items: [
						{ id: "chess", label: "Chess" },
						{ id: "go", label: "Go" },
						{ id: "draughts", label: "Draughts" },
					],
				},
				{
					id: "modern",
					title: "Modern games",
					items: [
						{ id: "catan", label: "Catan" },
						{ id: "carcassonne", label: "Carcassonne" },
					],
				},
			],
			block: {
				status: [
					{
						id: "played",
						type: "single_choice",
						label: "Have you played {{item.label}}?",
						options: [
							{ id: "never", label: "Never" },
							{ id: "once", label: "Once or twice" },
							{ id: "often", label: "Often" },
						],
					},
				],
				followUps: [
					{
						id: "why-not",
						type: "short_text",
						label: "Why have you never played {{item.label}}?",
						showIf: { question: "played", is: "never" },
					},
				],
			},
		},
		{
			type: "questions",
			id: "last",
			title: "Last thing",
			questions: [
				{ id: "note", type: "long_text", label: "Anything to add?" },
				{ id: "email", type: "email", label: "An address for the results", detached: true },
			],
		},
	],
});

type Given = [value: AnswerValue | null, activeMs: number, changes?: number];

/** A response from a short description of what it answered and for how long. */
function response(
	id: string,
	device: Device,
	state: { completed: boolean; position?: string },
	questions: Record<string, Given>,
	items: Record<string, Record<string, Given>> = {},
): ResponseRecord {
	let answers = emptyAnswers();
	for (const [question, [value, activeMs, changes = 0]] of Object.entries(questions)) {
		answers = withAnswer(answers, question, undefined, { value, activeMs, changes });
	}
	for (const [item, own] of Object.entries(items)) {
		for (const [question, [value, activeMs, changes = 0]] of Object.entries(own)) {
			answers = withAnswer(answers, question, item, { value, activeMs, changes });
		}
	}
	const createdAt = Date.UTC(2026, 0, 1);
	return {
		id,
		device,
		createdAt,
		completedAt: state.completed ? createdAt + 600_000 : null,
		position: state.position ?? null,
		answers,
	};
}

const played = (option: string, activeMs: number): Given => [{ option }, activeMs];

export const responses: ResponseRecord[] = [
	// Active: 4000 + 2000 + 3000, five games at 1000, one follow-up at 5000 = 19000.
	response(
		"r1",
		"desk",
		{ completed: true },
		{
			plays: [{ option: "weekly" }, 4000],
			owned: [10, 2000],
			likes: [{ options: ["strategy", "coop"] }, 3000, 1],
			note: ['He said "no", twice', 0],
		},
		{
			chess: { played: played("often", 1000) },
			go: { played: played("often", 1000) },
			draughts: { played: played("often", 1000) },
			catan: { played: played("once", 1000) },
			carcassonne: { played: played("never", 1000), "why-not": ["Too long", 5000] },
		},
	),
	// Active: 2000 + 1000 + 1000, five games at 500, follow-ups at 1500 and 500 = 8500.
	response(
		"r2",
		"phone",
		{ completed: true },
		{
			plays: [{ option: "monthly" }, 2000],
			owned: [4, 1000],
			likes: [{ options: ["party"] }, 1000],
			note: ["=cmd()", 0],
		},
		{
			chess: { played: played("never", 500), "why-not": ["No board", 1500] },
			// Shown the follow-up and left it empty.
			go: { played: played("never", 500), "why-not": [null, 500] },
			draughts: { played: played("once", 500) },
			catan: { played: played("often", 500) },
			carcassonne: { played: played("often", 500) },
		},
	),
	// Active: 1000 + 1000 + 1000, five games at 200 = 4000.
	response(
		"r3",
		"phone",
		{ completed: true },
		{
			plays: [{ option: "weekly" }, 1000],
			owned: [20, 1000],
			likes: [{ options: ["strategy", "other"], texts: { other: "Solo" } }, 1000],
		},
		{
			chess: { played: played("never", 200) },
			go: { played: played("never", 200) },
			draughts: { played: played("never", 200) },
			catan: { played: played("never", 200) },
			carcassonne: { played: played("never", 200) },
		},
	),
	// Active: 300 + 100, three games at 100 = 700. Saw "owned" and left it empty.
	response(
		"r4",
		"desk",
		{ completed: true },
		{ plays: [{ option: "rarely" }, 300], owned: [null, 100] },
		{
			chess: { played: played("never", 100) },
			go: { played: played("never", 100) },
			draughts: { played: played("never", 100) },
		},
	),
	// Not complete: stopped at Go, in the classics.
	response(
		"r5",
		"tablet",
		{ completed: false, position: "i:go:played" },
		{ plays: [{ option: "weekly" }, 1000] },
		{ chess: { played: played("once", 1000) } },
	),
	// Not complete: agreed to start and saved nothing.
	response("r6", "phone", { completed: false }, {}),
	// Not complete: stopped at the second question.
	response(
		"r7",
		"desk",
		{ completed: false, position: "q:owned" },
		{ plays: [{ option: "monthly" }, 500] },
	),
	// Not complete, at a place this form does not have.
	response("r8", "desk", { completed: false, position: "q:gone" }, {}),
];
