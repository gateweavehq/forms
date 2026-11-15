import { type Definition, type DefinitionInput, formatProblems, parseDefinition } from "../src";

/**
 * A small made-up form of the shape the product is for: a few questions, then the same question
 * for several items in two groups, with follow-ups for one of its answers.
 */
export function teaForm(): DefinitionInput {
	return {
		version: 1,
		id: "tea",
		title: "Tea at work",
		consent: { text: ["A made-up form about tea."], statement: "I agree to take part." },
		sections: [
			{
				type: "questions",
				id: "you",
				title: "You",
				questions: [
					{
						id: "drinks",
						type: "single_choice",
						label: "Do you drink tea?",
						options: [
							{ id: "yes", label: "Yes" },
							{ id: "no", label: "No" },
						],
					},
					{
						id: "cups",
						type: "number",
						label: "How many cups a day?",
						min: 0,
						showIf: { question: "drinks", is: "yes" },
					},
					{
						id: "additions",
						type: "multiple_choice",
						label: "What goes in it?",
						max: 2,
						options: [
							{ id: "milk", label: "Milk" },
							{ id: "sugar", label: "Sugar" },
							{ id: "lemon", label: "Lemon" },
							{ id: "other", label: "Something else", specify: true },
						],
					},
				],
			},
			{
				type: "repeat",
				id: "teas",
				title: "Teas",
				groups: [
					{
						id: "black",
						title: "Black teas",
						items: [
							{ id: "assam", label: "Assam", definition: "A strong, malty black tea." },
							{ id: "earl-grey", label: "B2: Earl Grey", name: "Earl Grey" },
						],
					},
					{
						id: "green",
						title: "Green teas",
						items: [
							{ id: "sencha", label: "Sencha" },
							{ id: "matcha", label: "Matcha" },
							{ id: "gunpowder", label: "Gunpowder" },
						],
					},
				],
				block: {
					status: [
						{
							id: "tried",
							type: "single_choice",
							label: "Have you tried {{item.name}}?",
							options: [
								{ id: "never", label: "Never" },
								{ id: "gave-up", label: "Tried it and gave it up" },
								{ id: "drink", label: "I drink it" },
							],
						},
					],
					followUps: [
						{
							id: "gave-up-why",
							type: "multiple_choice",
							label: "Why did you give up {{item.name}}?",
							showIf: { question: "tried", is: "gave-up" },
							options: [
								{ id: "taste", label: "The taste" },
								{ id: "price", label: "The price" },
								{ id: "other", label: "Another reason" },
							],
						},
						{
							id: "gave-up-other",
							type: "short_text",
							label: "What was the other reason?",
							showIf: { question: "gave-up-why", includes: "other" },
						},
						{
							id: "again",
							type: "single_choice",
							label: "Would you drink {{item.name}} again?",
							showIf: { question: "tried", is: "gave-up" },
							options: [
								{ id: "yes", label: "Yes" },
								{ id: "no", label: "No" },
							],
						},
					],
					followUpsIntro: "You gave up {{count}} of these.",
				},
			},
			{
				type: "questions",
				id: "last",
				title: "Last things",
				questions: [
					{ id: "comments", type: "long_text", label: "Anything else?" },
					{ id: "email", type: "email", label: "Your email, for the results", detached: true },
					{
						id: "contact",
						type: "single_choice",
						label: "May we write to you?",
						detached: true,
						showIf: { question: "email", answered: true },
						options: [
							{ id: "yes", label: "Yes" },
							{ id: "no", label: "No" },
						],
					},
				],
			},
		],
	};
}

type SectionInput = DefinitionInput["sections"][number];
type QuestionsInput = Extract<SectionInput, { type: "questions" }>;
type RepeatInput = Extract<SectionInput, { type: "repeat" }>;

/** The `questions` section with this id, for a test to change. */
export function questionsSection(form: DefinitionInput, id: string): QuestionsInput {
	const section = form.sections.find((candidate) => candidate.id === id);
	if (section?.type !== "questions") throw new Error(`No questions section "${id}"`);
	return section;
}

/** The form's `repeat` section with this id, for a test to change. */
export function repeatSection(form: DefinitionInput, id: string): RepeatInput {
	const section = form.sections.find((candidate) => candidate.id === id);
	if (section?.type !== "repeat") throw new Error(`No repeat section "${id}"`);
	return section;
}

/** Parses a definition that a test expects to be valid. */
export function valid(input: unknown): Definition {
	const result = parseDefinition(input);
	if (!result.ok) throw new Error(formatProblems(result.problems));
	return result.definition;
}

/** The problems of a definition, as `where: message` lines. */
export function problemsOf(input: unknown): string[] {
	const result = parseDefinition(input);
	return result.ok ? [] : result.problems.map(({ where, message }) => `${where}: ${message}`);
}
