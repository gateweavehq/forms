/**
 * Every string the app itself shows, in one place, so that a second language is one more object
 * of this shape. A form's own wording comes from its definition, never from here.
 */
export const strings = {
	product: "Gateweave Forms",
	tagline: "Long surveys that people finish.",
	/** At the end of a form's page: whose tool this is, in a few quiet words. */
	madeWith: {
		label: "Made with Gateweave Forms",
		href: "https://gateweave.com",
	},
	home: {
		forms: "Forms on this server",
		none: "There are no forms here yet.",
	},
	auth: {
		signInTitle: "Sign in to Gateweave Forms",
		signUpTitle: "Create your account",
		lead: "For the people who run forms. Answering one needs no account.",
		name: "Name",
		email: "Email",
		password: "Password",
		signIn: "Sign in",
		signUp: "Create account",
		signOut: "Sign out",
		noAccount: "No account yet?",
		haveAccount: "Already have an account?",
		closedNote: "This server takes new accounts from a list. Use the address that is on it.",
		closed: "This server takes new accounts from a list, and this address is not on it.",
		tooMany: "Too many tries with this address. Wait a minute and try again.",
		wrong: "The email or the password is not right.",
		exists: "There is already an account with this address. Sign in instead.",
		tooShort: "The password needs at least 8 characters.",
		failed: "That did not work. Check your connection and try again.",
	},
	account: {
		title: "Your account",
		changePassword: "Change password",
		current: "Current password",
		next: "New password",
		passwordChanged: "Your password is changed, and other devices are signed out.",
		passwordRefused:
			"The password was not changed. Check the current one, and that the new one has 8 characters.",
	},
	owner: {
		forms: "Your forms",
		backToForms: "Your forms",
		account: "Account",
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
		startOver:
			"Your answers so far are kept. You can continue, or start again with a new response.",
		/** The way to start when there is a response to continue: the quieter of the two. */
		again: "Start again",
		/** On a form with no consent text of its own, so the first page says something true. */
		saved: "Your answers are saved as you give them, so you can stop and continue later.",
	},
	position: {
		/** Sections are legs of the way. People are told which one they are on, never a percentage. */
		leg: (leg: number, legs: number) => `Part ${leg} of ${legs}`,
		group: (group: number, groups: number, title: string) =>
			groups > 1 ? `Group ${group} of ${groups}: ${title}` : title,
		/** On a group's own opening card, where its title is the heading. */
		groupOnly: (group: number, groups: number) => `Group ${group} of ${groups}`,
		item: (item: number, items: number) => `${item} of ${items}`,
		followUp: (item: number, items: number) =>
			items > 1 ? `Follow-up questions, ${item} of ${items}` : "Follow-up questions",
	},
	section: {
		/** How many questions a part asks. Some may only open after an answer, hence the range. */
		questions: (least: number, most: number) =>
			most === 1
				? "1 question"
				: least === most
					? `${most} questions`
					: `${least} to ${most} questions`,
		items: (items: number, groups: number) =>
			groups > 1
				? `${items} items in ${groups} groups, one tap each`
				: `${items} items, one tap each`,
		/** A group's size, on its opening card and in the list of groups. */
		groupItems: (items: number) => (items === 1 ? "1 item" : `${items} items`),
		/** The author's own estimate for a part. Rough on purpose, and never counted down. */
		minutes: (minutes: number) => (minutes <= 1 ? "About a minute" : `About ${minutes} minutes`),
		/** Said before a repeat section, so that moving on by itself surprises nobody. */
		movesOn:
			"When you pick an answer, the next item comes up by itself. Back is always there, and you can change any answer. Options, at the top, turns this off.",
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
		/** On an opening card: the one button that starts a part or a group. */
		begin: "Begin",
		finish: "Finish",
	},
	card: {
		more: "More about it",
		/** The switch that turns moving on by itself off. */
		autoAdvance: "Move on by itself after an answer",
		keys: (count: number) => `Keys 1 to ${count} pick an answer.`,
		/**
		 * Read by screen readers when the form moved on by itself. Where it moved to is not said
		 * here: the new card's heading takes the focus and says it, once.
		 */
		movedOn: "Answer saved.",
	},
	/** One mark for each item of the group being answered. Never more than one group's worth. */
	marks: {
		label: (group: string) => `Items of ${group}`,
		answered: (item: string) => `${item}, answered. Go back to it`,
		passed: (item: string) => `${item}, no answer yet. Go back to it`,
		current: (item: string) => `${item}, this one`,
		ahead: (item: string) => `${item}, still to come`,
	},
	/** The look back at a group's answers, before the form moves on from it. */
	review: {
		title: (group: string) => `Your answers: ${group}`,
		hint: "Have a look before going on. Pick a line to change it.",
		none: "No answer",
		change: (item: string, answer: string) => `${item}: ${answer}. Change`,
	},
	options: {
		open: "Options",
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
		/** Takes a single choice back to no answer, which radio buttons alone cannot do. */
		clear: "Clear my answer",
		clearRow: (row: string) => `Clear my answer for ${row}`,
		clearRowShort: "Clear",
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
		/** The person's own answers, to look over. Closed until asked for. */
		answersTitle: "What you answered",
		answersNote: "Your own answers, as they were saved. Nobody else's are shown.",
		noAnswer: "No answer",
	},
};
