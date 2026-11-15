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
		closed:
			"This server takes new accounts from a list, and this address cannot make one. If it already has an account, sign in.",
		tooMany: "Too many tries. Wait a minute and try again.",
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
		newForm: "New form",
		noForms: "You have no forms yet. Bring one in to get its link.",
		failed: "That did not work. Check your connection and try again.",
		cancel: "Cancel",
		notFound: {
			title: "There is no such form",
			body: "It does not exist, or it belongs to another account.",
		},
		state: { draft: "Draft", open: "Open", closed: "Closed" },
		counts: (started: number, completed: number) => `${started} started, ${completed} completed`,
		examples: (count: number) =>
			count === 1
				? "This server has 1 example form for local development."
				: `This server has ${count} example forms for local development.`,
		addExamples: "Add them to my account",
		examplesLeftOut:
			"Not all of them could be added. An example that was answered before it belonged to anyone, or that another account has, cannot be taken.",
		nav: {
			overview: "Overview",
			questions: "Questions",
			items: "Items",
			responses: "Responses",
			detached: "Kept apart",
			settings: "Settings",
		},
		link: "The form's link",
		newTitle: "Bring a form in",
		newLead:
			"There is no builder yet. A form comes in as a definition, or from the page of a form you already have on Tally. You see what it becomes before anything is stored, and it starts as a draft.",
		bringIn: {
			what: "What do you have?",
			definition: "A definition (JSON)",
			tally: "A Tally form's page",
			definitionHelp:
				"A definition is a JSON document in the shape docs/architecture.md describes. Its id becomes the form's address.",
			tallyHelp:
				"Open the form on Tally, save the page, and upload it here; or copy the JSON inside its __NEXT_DATA__ script. Only bring in forms you have the right to use.",
			file: "Upload a file",
			paste: "Or paste it",
			fromFile: (name: string, characters: number) => `${name} (${characters} characters)`,
			clearFile: "Remove the file",
			acceptDifferences:
				"Fold repeated questions even where copies differ, taking what most copies have",
			detachEmail: "Store email questions apart from the answers",
			id: "Address, if the one made from the title will not do",
			idPlaceholder: "for example bread-at-home",
			check: "Check it",
			notValid: "This cannot be brought in as it is:",
			outline: "What it becomes",
			address: (id: string) => `Its address will be /f/${id}`,
			withConsent: "starts with a consent",
			withoutConsent: "no consent step",
			questions: (count: number) => (count === 1 ? "1 question" : `${count} questions`),
			repeat: (items: number[], questions: number) =>
				`${items.reduce((sum, count) => sum + count, 0)} items in ${items.length} ${items.length === 1 ? "group" : "groups"} (${items.join(", ")}), ${questions} ${questions === 1 ? "question" : "questions"} for each`,
			source: (pages: number, blocks: number, rules: number) =>
				`The Tally form has ${pages} pages, ${blocks} blocks and ${rules} rules.`,
			folded: (pages: number[], items: number) =>
				`Pages ${pages.join(", ")} repeat the same questions for ${items} items, and were folded into one section.`,
			settled: (count: number) =>
				count === 1
					? "1 difference between the copies was settled by what most of them have:"
					: `${count} differences between the copies were settled by what most of them have:`,
			notFolded: (pages: number[], items: number) =>
				`Pages ${pages.join(", ")} look like the same questions repeated for ${items} items, and were not folded: the copies differ in more than the item's name.`,
			notFoldedHelp:
				"Correct them on Tally and bring the page in again, or tick the box above to take what most copies have.",
			notes: "Changed or left out on the way:",
			difference: (item: string, where: string, found: string, expected: string) =>
				`${item}, ${where}: "${found}" where most have "${expected}"`,
			create: "Bring it in as a draft",
			replace: "Use this definition from now on",
		},
		results: {
			version: "Version",
			versionOption: (hash: string, started: number, current: boolean) =>
				`${hash.slice(0, 8)}${current ? " (current)" : ""}: ${started} started`,
			device: "Device",
			allDevices: "All devices",
			devices: { phone: "Phone", tablet: "Tablet", desk: "Desk" },
			answer: "Answer",
			anyAnswer: "Any answer",
			counted: (counted: number, all: number) =>
				counted === all
					? `Counting all ${all} ${all === 1 ? "response" : "responses"} to this version.`
					: `Counting ${counted} of the ${all} ${all === 1 ? "response" : "responses"} to this version.`,
			clear: "Clear the filter",
			none: "No responses yet.",
			noneCounted: "No response matches this filter.",
			started: "Started",
			completed: "Completed",
			completedShare: "Completed, of those started",
			ofStarted: (completed: number, started: number) => `${completed} of ${started}`,
			timeTitle: "Median active time of completed responses",
			timeLead:
				"Active time is how long questions were on screen in a visible tab, added up. Time away does not count.",
			timeRow: (count: number) => (count === 1 ? "1 response" : `${count} responses`),
			noTime: "none completed",
			stoppedTitle: "Where the unfinished ones stopped",
			stoppedLead: (count: number) =>
				count === 1
					? "1 response was started and not completed. This is how far it got: the part of the form with the last question it answered or passed."
					: `${count} responses were started and not completed. This is how far each got: the part of the form with the last question it answered or passed.`,
			lastQuestions: "The last question each got to",
			stoppedNone: "Every response that was started was completed.",
			stoppedAtStart: "Before the first question",
			seen: (answered: number, seen: number) => `${answered} answered of ${seen} shown`,
			median: (time: string) => `median ${time} on screen`,
			changes: (count: number) => (count === 1 ? "changed once" : `changed ${count} times`),
			share: (count: number, percent: string) => `${count} (${percent})`,
			number: { min: "Lowest", max: "Highest", mean: "Mean", median: "Median" },
			noAnswers: "No answers.",
			texts: (count: number) => (count === 1 ? "1 answer" : `${count} answers`),
			written: "Written beside it:",
			ranking: {
				option: "Option",
				meanPlace: "Mean place",
				first: "Placed first",
				ranked: "Placed",
			},
			noQuestions: "This version asks nothing outside its items.",
			noItems: "This version has no section that repeats questions for items.",
			item: "Item",
			itemAnswered: "Answered",
			itemTime: "Median time",
			followUps: "Follow-up questions",
			followUpsLead: "Asked only after certain answers, so each is out of the few who saw it.",
			followUpsOf: (item: string, count: number) =>
				`${item}: ${count} ${count === 1 ? "answer" : "answers"}`,
			noFollowUps: "No follow-up question has an answer yet.",
			response: "Response",
			responseTitle: (id: string) => `Response ${id}`,
			state: "State",
			complete: "Completed",
			incomplete: "Not completed",
			activeTime: "Active time",
			signals: "Worth a look",
			signalsLead: (median: string) =>
				`"Fast" is a completed response with under 30% of the median active time (${median}). "Same answer" is a group where three or more items got the same status. Neither proves anything.`,
			fast: "Fast",
			straight: (groups: string[]) => `Same answer: ${groups.join(", ")}`,
			changed: (count: number) => (count === 1 ? "1 change" : `${count} changes`),
			open: "Open",
			backToResponses: "All responses",
			startedAt: "Started",
			completedAt: "Completed",
			notShown: "Left empty",
			deleteResponse: "Delete this response",
			deleteResponseTitle: "Delete this response?",
			deleteResponseBody:
				"This removes the response and its answers for good. Answers kept apart are not connected to it and stay.",
			exports: "Export",
			exportsLead:
				"The responses to this version as CSV, one row each, and a codebook that says what each column and value means. The filter does not apply to an export.",
			exportResponses: "Responses (CSV)",
			exportCodebook: "Codebook (CSV)",
			detachedLead:
				"Answers this form keeps apart from the responses, such as an address for the results. They carry no response and no time, and their order here is drawn anew every time the page is read.",
			detachedOpen:
				"These are shown once the form is closed. While it takes answers, a row that appeared here could be matched with the response that was just completed.",
			detachedFew: (needed: number) =>
				needed === 1
					? "This form is closed and holds too few of these to show: 1 more is needed. Among so few, each could be matched with a response by counting."
					: `This form is closed and holds too few of these to show: ${needed} more are needed. Among so few, each could be matched with a response by counting.`,
			exportDetached: "Kept apart (CSV)",
			detachedCount: (count: number) => (count === 1 ? "1 row" : `${count} rows`),
		},
		settings: {
			stateTitle: "Taking answers",
			draft: "This form is a draft. Its link says it is not open yet.",
			open: "This form is open. Anyone with its link can answer it.",
			closed:
				"This form is closed. Its link says so, and nobody can start it. Someone who had begun can still finish.",
			openIt: "Open it for answers",
			closeIt: "Close it",
			closeTitle: "Close this form?",
			closeBody:
				"Its link will say that it is closed, and nobody will be able to start. Nothing is deleted, and you can open it again.",
			versionsTitle: "Versions of the definition",
			versionsLead:
				"A response keeps the definition it started under. Results are shown per version.",
			version: (hash: string) => `Version ${hash.slice(0, 8)}`,
			current: "current: new responses start under it",
			replaceTitle: "A new definition",
			replaceLead:
				"Editing a form means bringing in a new definition with the same id. Responses already begun keep the one they started under.",
			deleteTitle: "Delete every response",
			deleteLead: (responses: number, answers: number, detached: number) =>
				`This form holds ${responses} ${responses === 1 ? "response" : "responses"} with ${answers} ${answers === 1 ? "answer" : "answers"}, and ${detached} ${detached === 1 ? "answer" : "answers"} kept apart.`,
			deleteAll: "Delete all responses",
			deleteAllTitle: "Delete every response of this form?",
			deleteAllBody:
				"This removes all of them for good, the answers kept apart included. The form, its link and its definitions stay. Export first if you need the data.",
			deleteAllConfirm: (responses: number) =>
				`Delete ${responses} ${responses === 1 ? "response" : "responses"}`,
		},
	},
	notFound: {
		title: "Page not found",
		body: "Check the address. A form's link has to be complete to work.",
	},
	formNotFound: {
		title: "There is no such form",
		body: "Check the link you were sent. It may have been cut short on the way.",
	},
	formDraft: {
		title: "This form is not open yet",
		body: "Whoever sent you the link has not opened it for answers. Try again later.",
	},
	error: {
		title: "Something went wrong",
		body: "This page could not be loaded.",
		retry: "Try again",
	},
	start: {
		begin: "Start",
		closed: "This form is closed and takes no new answers. Thank you for coming.",
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
		forget: "Forget it on this device",
		forgetNote:
			"Forgetting removes the way back from this browser. The answers stay saved, and only their full address opens them.",
		consentCopy: "Open this text on its own, to print or keep",
	},
	yours: {
		open: "Your answers and this device",
		title: "Your answers and this device",
		consentCopy: "Open the consent text, to print or keep",
		forgetTitle: "Forget on this device",
		forgetBody:
			"This browser remembers the way back to your answers, so that the form's link can offer them again. Forgetting removes that. Your answers stay saved, and from then on only their full address opens them.",
		forget: "Forget on this device",
		withdrawTitle: "Withdraw",
		withdrawBody:
			"Deletes everything you have answered so far, for good. You can do this until you finish the form.",
		withdraw: "Delete my answers",
		withdrawSure: "This cannot be undone.",
		withdrawConfirm: "Yes, delete them",
		withdrawFailed: "Your answers could not be deleted. Check your connection and try again.",
		close: "Close",
		withdrawnTitle: "Your answers were deleted",
		withdrawnBody: "Nothing you answered is stored any more. You can close this page.",
	},
	consentCopy: {
		heading: "Consent text",
		of: (form: string) => `Of the form "${form}"`,
		statement: "The statement you agreed to:",
		print: "Print or save as PDF",
		back: "Back to the form",
		noneTitle: "This form has no consent text",
		noneBody: "It starts without one, so there is nothing to keep a copy of.",
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
		detachedClosed: "This form has closed in the meantime, so this was not stored.",
		sent: "Sent. Thank you.",
		/** The person's own answers, to look over. Closed until asked for. */
		answersTitle: "What you answered",
		answersNote: "Your own answers, as they were saved. Nobody else's are shown.",
		noAnswer: "No answer",
	},
};
