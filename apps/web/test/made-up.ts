/**
 * A made-up form about house plants, small enough to work its results out by hand: three
 * questions, five plants in two groups with one follow-up, and an address kept apart.
 */
export function plantForm(id = "house-plants", title = "Plants at home") {
	return {
		version: 1,
		id,
		title,
		sections: [
			{
				type: "questions",
				id: "you",
				title: "Your home",
				questions: [
					{
						id: "light",
						type: "single_choice",
						label: "How much light does your home get?",
						options: [
							{ id: "bright", label: "A lot" },
							{ id: "some", label: "Some" },
							{ id: "dim", label: "Very little" },
						],
					},
					{ id: "count", type: "number", label: "How many plants do you have?", min: 0 },
					{
						id: "rooms",
						type: "multiple_choice",
						label: "Which rooms have plants?",
						options: [
							{ id: "kitchen", label: "Kitchen" },
							{ id: "bedroom", label: "Bedroom" },
							{ id: "bath", label: "Bathroom" },
						],
					},
				],
			},
			{
				type: "repeat",
				id: "plants",
				title: "Five plants",
				groups: [
					{
						id: "leafy",
						title: "Leafy plants",
						items: [
							{ id: "fern", label: "Fern" },
							{ id: "pothos", label: "Pothos" },
							{ id: "monstera", label: "Monstera" },
						],
					},
					{
						id: "succulents",
						title: "Succulents",
						items: [
							{ id: "aloe", label: "Aloe" },
							{ id: "jade", label: "Jade plant" },
						],
					},
				],
				block: {
					status: [
						{
							id: "kept",
							type: "single_choice",
							label: "Have you kept a {{item.label}}?",
							options: [
								{ id: "never", label: "Never" },
								{ id: "now", label: "I have one now" },
								{ id: "gave-up", label: "I gave up on it" },
							],
						},
					],
					followUps: [
						{
							id: "why",
							type: "short_text",
							label: "Why did you give up on the {{item.label}}?",
							showIf: { question: "kept", is: "gave-up" },
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
					{
						id: "email",
						type: "email",
						label: "Leave an address for the results, if you like.",
						detached: true,
					},
				],
			},
		],
	};
}
