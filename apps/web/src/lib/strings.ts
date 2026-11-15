/**
 * Every string the app itself shows, in one place, so that a second language is one more object
 * of this shape. A form's own wording comes from its definition, never from here.
 */
export const strings = {
	product: "Gateweave Forms",
	tagline: "Long surveys that people finish.",
	home: {
		forms: "Forms on this server",
		none: "There are no forms here yet.",
	},
	notFound: {
		title: "Page not found",
		body: "Check the address. A form's link has to be complete to work.",
	},
	formNotFound: {
		title: "There is no such form",
		body: "Check the link you were sent. It may have been cut short on the way.",
	},
	error: {
		title: "Something went wrong",
		body: "This page could not be loaded.",
		retry: "Try again",
	},
	start: {
		begin: "Start",
		/** Shown when the consent's box is not ticked. */
		consentNeeded: "Tick the box to take part.",
		failed: "The form could not be started. Check your connection and try again.",
		/** The form's ceiling on new responses a minute was reached. */
		busy: "Many people are starting this form right now. Wait a minute and press Start again.",
		resumeTitle: "You started this form on this device",
		resume: "Continue where you stopped",
		startOver: "Or start again from the beginning below.",
	},
	position: {
		/** Sections are legs of the way. People are told which one they are on, never a percentage. */
		leg: (leg: number, legs: number) => `Part ${leg} of ${legs}`,
		group: (group: number, groups: number, title: string) =>
			groups > 1 ? `Group ${group} of ${groups}: ${title}` : title,
		item: (item: number, items: number) => `${item} of ${items}`,
		followUp: (item: number, items: number) =>
			items > 1 ? `Follow-up questions, ${item} of ${items}` : "Follow-up questions",
	},
	section: {
		questions: (count: number) => (count === 1 ? "1 question" : `${count} questions`),
		items: (items: number, groups: number) =>
			groups > 1
				? `${items} items in ${groups} groups, one tap each`
				: `${items} items, one tap each`,
		/** Said before a repeat section, so that moving on by itself surprises nobody. */
		movesOn:
			"When you pick an answer, the next item comes up by itself. Back is always there, and you can change any answer.",
		followUpsIntro: (count: number) =>
			count === 1
				? "A few more questions about one of these."
				: `A few more questions about ${count} of these.`,
	},
	nav: {
		back: "Back",
		next: "Next",
		skip: "Skip",
		continue: "Continue",
		finish: "Finish",
	},
	card: {
		more: "More about it",
		/** The switch that turns moving on by itself off. */
		autoAdvance: "Move on by itself after an answer",
		keys: (count: number) => `On a keyboard, keys 1 to ${count} pick an answer.`,
		/** Read by screen readers when the form moved on by itself. */
		movedOn: (where: string) => `Answer saved. Next: ${where}`,
	},
	input: {
		specify: "Please specify",
		choose: "Choose…",
		upTo: (max: number) => `Choose up to ${max}.`,
		limitReached: (max: number) => `That is ${max}. Untick one to pick another.`,
		rankHint: "Pick them in order, the most important first. Pick one again to take it out.",
		ranked: (rank: number) => `ranked ${rank}`,
		notRanked: "not ranked",
		clearRanking: "Clear the order",
	},
	problem: {
		required: "This question needs an answer.",
		rows: (labels: string[]) =>
			`This question needs an answer for each line. Still open: ${labels.join(", ")}.`,
		fields: (labels: string[]) => `Please fill in: ${labels.join(", ")}.`,
		ranking: (count: number) => `Please put all ${count} in order.`,
		number: "Enter a number, or leave it empty.",
		integer: "Enter a whole number.",
		min: (min: number) => `Enter ${min} or more.`,
		max: (max: number) => `Enter ${max} or less.`,
		email: "Enter an email address, or leave it empty.",
		tooLong: (max: number) => `Keep it under ${max} characters.`,
	},
	saving: {
		failed: "Your last answer has not been saved yet. Check your connection.",
		retry: "Try again",
		/** The server would not take an answer. It is not stored, and the person has to know. */
		refused:
			"One of your answers could not be saved, because the form did not accept it. Go back to it and answer again.",
		dismiss: "OK",
	},
	elsewhere: {
		open: "Continue on another device",
		title: "Continue on another device",
		body: "Open this address on the other device. Your answers so far will be there, and you go on where you stopped. Anyone with this address can see and change your answers, so keep it to yourself.",
		copy: "Copy the address",
		copied: "Copied",
		close: "Close",
	},
	response: {
		loading: "Loading your answers…",
		missingTitle: "This link is incomplete",
		missingBody:
			"The address of a response ends in a long code after a # sign. Without it, the answers cannot be opened. Copy the whole address again from where you saved it.",
		notFoundTitle: "These answers cannot be found",
		notFoundBody:
			"The link may have been cut short, or it belongs to a response that no longer exists.",
		startAgain: "Start the form from the beginning",
		formChanged:
			"This form was changed after you started it. You are answering it as it was when you began, and your answers are kept.",
	},
	end: {
		title: "Thank you",
		body: "Your answers are saved. You can close this page.",
		finishFailed: "The form could not be finished. Check your connection and try again.",
		detachedTitle: "One more thing, if you like",
		detachedBody:
			"What you enter here is stored apart from your answers, without anything that names your response.",
		send: "Send",
		sendFailed: "This could not be sent. Check your connection and try again.",
		sendBusy: "Many people are sending this right now. Wait a minute and press Send again.",
		sent: "Sent. Thank you.",
	},
};
