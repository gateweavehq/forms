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
		deleteTitle: "Delete this account",
		deleteLead:
			"Removes your name, your email address, your password and your sessions. An account that still has forms cannot be deleted.",
		/** On a server that takes accounts from a list, the address stays on the list. */
		deleteAllowNote:
			"If this server takes new accounts from a list, your address stays on that list, and whoever signs up with it next gets a new account. Ask whoever runs the server to take it off.",
		/** While the account owns forms: what has to happen first, and where. */
		deleteBlocked: (forms: number) =>
			forms === 1
				? "You have 1 form. Delete it first, under its Settings: that removes its responses too, and says how many."
				: `You have ${forms} forms. Delete each of them first, under its Settings: that removes its responses too, and says how many.`,
		delete: "Delete my account",
		deleteDialog: "Delete your account?",
		deleteBody:
			"This removes the account and signs you out everywhere, and the app cannot bring it back. Whoever runs this server can still restore the database as it was for up to 30 days.",
		deletePassword: "Your current password, to confirm",
		deleteConfirm: "Delete the account",
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
			runBy: (name: string) => `Run by ${name}.`,
			noController:
				"It does not say who runs it. It can be brought in as a draft, and you add that under Settings before opening it.",
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
				"This removes the response and its answers, and the app cannot bring them back. Answers kept apart are not connected to it and stay. Whoever runs this server can still restore the database as it was for up to 30 days.",
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
			/** `detached` is null while the form is open: how many there are is not said then. */
			deleteLead: (responses: number, answers: number, detached: number | null) =>
				`This form holds ${responses} ${responses === 1 ? "response" : "responses"} with ${answers} ${answers === 1 ? "answer" : "answers"}${
					detached === null
						? ". Answers kept apart, if there are any, are removed too: how many there are is shown once the form is closed."
						: `, and ${detached} ${detached === 1 ? "answer" : "answers"} kept apart.`
				}`,
			deleteAll: "Delete all responses",
			deleteAllTitle: "Delete every response of this form?",
			deleteAllBody:
				"This removes all of them, the answers kept apart included, and the app cannot bring them back. The form, its link and its definitions stay. Export first if you need the data. Whoever runs this server can still restore the database as it was for up to 30 days.",
			deleteAllConfirm: (responses: number) =>
				`Delete ${responses} ${responses === 1 ? "response" : "responses"}`,
			/** Beside a version's counts, when anyone took their answers back. */
			withdrawn: (count: number) =>
				count === 1
					? "1 taken back by the person who gave it"
					: `${count} taken back by the people who gave them`,
			withdrawnNote:
				"A response that was taken back is deleted and in neither number. Only how many is kept, not which or when.",
			controllerTitle: "Who runs this form",
			controllerLead:
				"The first page tells everyone who answers who runs the study and how to reach them, and links a page that lists what is stored. A form cannot be opened for answers without it.",
			controllerMissing:
				"Missing: this form does not say who runs it yet. Fill this in to be able to open it.",
			controllerName: "Name of the person or organisation",
			controllerContact: "How to reach them: an email address, a page or a postal address",
			controllerSave: "Save",
			controllerSaved: "Saved. New responses start under this version.",
			controllerNote:
				"Saving makes a new version of the definition. Responses already begun keep the one they started under.",
			withdrawalTitle: "Taking answers back",
			withdrawal: {
				"until-closed":
					"People can take their own answers back also after finishing, until you close this form. The first page says so.",
				"until-complete":
					"People can take their own answers back until they finish, and not after. The first page says so.",
			},
			withdrawalHow:
				'This is "withdrawal" in the definition: "until-closed" (the default) or "until-complete".',
			storedLink: "The page that lists what is stored",
			deleteFormTitle: "Delete this form",
			deleteFormLead:
				"Removes the form, its link, every version of its definition, and everything it holds.",
			deleteForm: "Delete this form",
			deleteFormDialog: "Delete this form and everything in it?",
			deleteFormHolds: (
				responses: number,
				answers: number,
				detached: number | null,
				versions: number,
			) =>
				`It holds ${responses} ${responses === 1 ? "response" : "responses"} with ${answers} ${answers === 1 ? "answer" : "answers"}, ${
					detached === null
						? "answers kept apart if there are any (how many is shown once the form is closed)"
						: `${detached} ${detached === 1 ? "answer" : "answers"} kept apart`
				}, and ${versions} ${versions === 1 ? "version" : "versions"} of its definition.`,
			deleteFormBody:
				"All of it is removed in one step, and the app cannot bring it back. Anyone answering right now loses their place, and the form's link stops working. Its id stays yours: you can bring a form in under it again, and nobody else can, so that an old link never opens someone else's form. Export first if you need the data. Whoever runs this server can still restore the database as it was for up to 30 days.",
			deleteFormType: (id: string) => `Type the form's id, ${id}, to confirm`,
			deleteFormConfirm: "Delete the form",
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
		/** Before the reference a failure was logged under, which follows it and a full stop. */
		reference:
			"If it keeps happening, whoever runs this server can find it in the log under the reference",
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
	/** Who runs a form, and what a person can do about their answers: said before they start. */
	about: {
		label: "About this form",
		runBy: "Run by",
		/** Until when a person can take their answers back themselves. One line for each rule. */
		withdrawal: {
			"until-closed":
				"You can take your answers back yourself at any time, also after you finish, for as long as this form is open.",
			"until-complete":
				"You can take your answers back yourself until you finish. After that, ask whoever runs this form.",
		},
		/** On a closed form whose rule was "for as long as it is open". */
		closed:
			"This form has closed, so answers that were finished can no longer be taken back from their address. To have yours deleted, ask whoever runs this form.",
		stored: "What is stored about you",
	},
	stored: {
		heading: "What is stored",
		of: (form: string) => `About the form "${form}"`,
		lead: "This page lists everything the server keeps when you answer this form. It is made from the server's own list of what it stores, so nothing is kept that is not named here.",
		controllerTitle: "Who runs this form",
		controllerBody:
			"They decide what the answers are used for, and they are who to ask about yours.",
		noController: "This form does not say who runs it. Ask whoever sent you its link.",
		notTitle: "What is not stored",
		not: [
			"Your name, unless a question asks for it and you give it.",
			"Your network (IP) address. The app does not read or store it for anything you send. The network that carries your request to the server sees it, as with any web page.",
			"Your browser, your device's make or its settings. Only whether the window was the width of a phone, a tablet or a desk screen when you started.",
			"No cookie is set for answering. Your own browser remembers the way back to your answers, and Options on any card makes it forget.",
		],
		tables: {
			response: "Once for your response",
			answer: "For each answer you give",
			detachedAnswer: "Kept apart from your answers",
		},
		detachedLead:
			"This form asks for something at the end that it keeps apart, such as an address for the results. It is stored with nothing that names your response: not its code, and no time.",
		detachedLimit:
			"That is all it is. Whoever runs the server could still work out which row came with which response, for example from when each first appeared.",
		/** One line for each thing the server stores, under the name its own list gives it. */
		columns: {
			response: {
				id: "A random code for your response. It is part of the address of your answers.",
				formId: "Which form you answered.",
				definitionHash:
					"Which wording of the form you answered, so that your answers are read against the questions you saw.",
				answersVersion: "A number for the format answers are stored in. It says nothing about you.",
				secretSeal:
					"A seal that proves the long code at the end of your address, without being that code. The code itself is only in your address.",
				device:
					"Whether you started on a phone, a tablet or a desk screen, judged by the width of the window.",
				position: "Which card you are on, so that you can continue on another device.",
				createdAt: "When you started.",
				updatedAt:
					"When your response last changed: an answer given or changed, a move to another card, or finishing.",
				completedAt: "When you finished.",
			},
			answer: {
				responseId: "Which response the answer belongs to.",
				questionId: "Which question it answers.",
				itemId: "Which item it is about, where a question is asked about several.",
				value: "The answer itself, or that you passed the question without one.",
				activeMs: "How long the question was on your screen while the page was visible.",
				changes: "How often you replaced the answer with a different one.",
				updatedAt: "When you gave the answer or last changed it.",
				saveId:
					"A random code your browser made for the last time this answer was saved, so that an answer sent twice over a poor connection is counted once. It is replaced each time, and it identifies neither you nor your device.",
			},
			detachedAnswer: {
				id: "A random number. It is not a count, so it does not say in which order rows arrived.",
				formId: "Which form it was given to.",
				answers: "What you entered.",
			},
		} as Record<string, Record<string, string>>,
		withdrawTitle: "Taking your answers back",
		withdrawDoes:
			"Taking your answers back deletes your response, every answer in it and the times that go with them, in one step. It is done from the address of your answers, on any device that has it.",
		withdrawCount:
			"Whoever runs the form sees that a response is gone from their list, and may have looked at its answers before. A count of how many responses were taken back is kept as well. It holds no name and no time; what it adds for them is that a response which is gone was taken back by the person who gave it.",
		withdrawDetached:
			"What this form keeps apart stays. Nothing connects it to your response, so it cannot be found from your address. To have it removed, ask whoever runs the form.",
		withdrawCopies:
			"Deleting reaches this server only. If whoever runs the form has already saved a copy of the answers, that copy is theirs to delete: ask them.",
		historyTitle: "How long a deleted answer remains",
		history: (days: number) =>
			`Deleted means removed from the database as it is now. The database keeps its own history for up to ${days} days, from which whoever runs the server could bring back an earlier state. After that, what was deleted is gone from there too.`,
		logTitle: "When the server fails",
		log: "If the database fails while something of yours is being stored or read, the server notes it in its log, so that whoever runs it can find what went wrong: the kind of failure, a random reference, and the database command with a placeholder wherever a value was. Your answers are not in that note, and neither are the codes in your address or anything else you sent.",
		print: "Print or save as PDF",
		back: "Back to the form",
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
		/** Until when, by the rule of the form as the person began it. */
		withdrawBody: {
			"until-closed":
				"Deletes everything you have answered so far. You can also do this after you finish, for as long as the form is open. The server's database can still be restored as it was for up to 30 days.",
			"until-complete":
				"Deletes everything you have answered so far. You can do this until you finish the form. The server's database can still be restored as it was for up to 30 days.",
		},
		withdraw: "Delete my answers",
		withdrawSure: "This cannot be undone.",
		withdrawConfirm: "Yes, delete them",
		withdrawFailed: "Your answers could not be deleted. Check your connection and try again.",
		close: "Close",
		withdrawnTitle: "Your answers were deleted",
		withdrawnBody:
			"Your response, its answers and the times that go with them were deleted from this server. Its database can still be restored as it was for up to 30 days. If whoever runs this form saved a copy before now, that copy is theirs to delete.",
		/** Added for a form that keeps something apart, which withdrawing cannot reach. */
		withdrawnDetached:
			"Anything you entered to be kept apart, such as an address for the results, is still stored: nothing connects it to your answers, so it could not be found. To have it removed, ask whoever runs this form.",
		withdrawnClose: "You can close this page.",
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
		/** What a person can still do about answers they have finished giving. */
		takeBack: {
			title: "Changed your mind?",
			/** While the server would do it. */
			can: "You can take your answers back for as long as this form is open. This page's address is the only way back to them, so keep it if you may want to: it works on any device.",
			/** The form lets go of nothing after the end. */
			never:
				"Your answers are part of the study now and cannot be taken back from here. To have them deleted, ask whoever runs this form.",
			/** The form would have, and is closed. */
			closed:
				"This form has closed, so answers can no longer be taken back from here. To have yours deleted, ask whoever runs this form.",
			ask: "Take my answers back",
			sure: "This deletes your response, every answer in it and the times that go with them. It cannot be undone.",
			sureDetached:
				"Anything you entered to be kept apart, such as an address for the results, stays: nothing connects it to your answers, so it cannot be found from here. To have it removed, ask whoever runs this form.",
			confirm: "Yes, delete my answers",
			/** The server said no: the form closed in the meantime, or they are gone already. */
			refused:
				"Your answers could not be taken back from here: the form has closed in the meantime, or they were already deleted. Ask whoever runs this form.",
			failed: "Your answers could not be deleted. Check your connection and try again.",
		},
	},
};
