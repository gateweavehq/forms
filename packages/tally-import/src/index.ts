import {
	type Definition,
	type DefinitionInput,
	formatProblems,
	type Paragraph,
	parseDefinition,
	referencedQuestions,
} from "@gateweave/forms-schema";
import { type Draft, Emitter, type QuestionsDraft } from "./emit";
import {
	type CopiesPage,
	type Difference,
	foldPages,
	gatherQuestions,
	pageTitle,
	paragraphsOf,
	type RefusedRun,
	readCopies,
	sameQuestions,
} from "./fold";
import { slug } from "./ids";
import { type RawPage, readForm } from "./read";
import { extractPageData, readTallyForm } from "./tally";

export type { Difference, RefusedRun } from "./fold";
export { extractPageData } from "./tally";

export interface ImportOptions {
	/** The form's id, which names it in its address. Made from its title when absent. */
	id?: string;
	/** Folds pages of repeated questions into `repeat` sections. On unless `false`. */
	fold?: boolean;
	/**
	 * Lets a fold go ahead when the copies differ in something other than the item's name, by
	 * taking what most copies have. Every such place is listed in the report.
	 */
	acceptDifferences?: boolean;
	/**
	 * Marks email questions, and the questions that depend only on them, as detached: asked at
	 * the end and stored apart from the response. Tally has no such thing, so a form that
	 * promises it in its text needs this said here.
	 */
	detachEmail?: boolean;
}

export interface SectionSummary {
	id: string;
	title: string;
	type: "questions" | "repeat";
	/** How many questions the section has, or for a repeat section its block. */
	questions: number;
	/** A repeat section's groups with the number of items in each. */
	groups?: Array<{ title: string; items: number }>;
	/** The answers of each status question, in order. */
	status?: string[][];
	followUps?: number;
}

export interface FoldSummary {
	/** The id of the `repeat` section it became. */
	section: string;
	/** The source pages it was folded from, from 1. */
	pages: number[];
	items: number;
	/** The places where one copy differed and what most copies have was taken. */
	settled: Difference[];
}

export interface ImportReport {
	title: string;
	/** What the source held. */
	source: { pages: number; blocks: number; rules: number };
	hasConsent: boolean;
	sections: SectionSummary[];
	/** What was changed or left out on the way, for a person to read. */
	notes: string[];
	folded: FoldSummary[];
	/** Runs of pages that look like one question repeated, and why they were not folded. */
	refused: RefusedRun[];
}

export type ImportResult =
	| { ok: true; definition: Definition; report: ImportReport }
	| { ok: false; problems: string[] };

/** The first page as a consent: text, then one required tick, and nothing else. */
function readConsent(page: RawPage): DefinitionInput["consent"] | undefined {
	const last = page.elements[page.elements.length - 1];
	if (last?.kind !== "question" || !last.lone || !last.required) return undefined;
	const before = page.elements.slice(0, -1);
	if (before.some((element) => element.kind !== "text")) return undefined;
	const text = before.flatMap((element) => (element.kind === "text" ? paragraphsOf(element) : []));
	if (text.length === 0 || !last.title) return undefined;
	return { text, statement: last.title };
}

function questionsDraft(page: RawPage, notes: Set<string>): QuestionsDraft {
	const { title, rest } = pageTitle(page);
	// A page's own text ends where its first question, or the first heading inside it, begins:
	// from there on, text is about the question below it.
	const firstInner = rest.findIndex(
		(element) => element.kind === "question" || element.heading || element.disclosed,
	);
	const lead = firstInner < 0 ? rest : rest.slice(0, firstInner);
	const { asked, trailing } = gatherQuestions(firstInner < 0 ? [] : rest.slice(firstInner));
	if (trailing.length > 0) {
		notes.add(
			"Text below a page's last question was moved to the top of its section: a section's text comes before its questions.",
		);
	}
	const text: Paragraph[] = [
		...lead.flatMap((element) => (element.kind === "text" ? paragraphsOf(element) : [])),
		...trailing,
	];
	return {
		type: "questions",
		page: page.number,
		title: title ?? page.name ?? `Page ${page.number}`,
		text,
		questions: asked.map(({ question, description, detail }) => {
			question.description = description;
			question.detail = detail;
			return question;
		}),
	};
}

/** Marks email questions and what depends only on them as stored apart. */
function detachEmail(definition: DefinitionInput): void {
	const detached = new Set<string>();
	for (const section of definition.sections) {
		if (section.type !== "questions") continue;
		for (const question of section.questions) {
			const dependsOnDetached =
				question.showIf !== undefined &&
				referencedQuestions(question.showIf).every((id) => detached.has(id));
			if (question.type !== "email" && !dependsOnDetached) continue;
			question.detached = true;
			detached.add(question.id);
		}
	}
}

function summarise(definition: Definition): SectionSummary[] {
	return definition.sections.map((section) => {
		const base = { id: section.id, title: section.title, type: section.type };
		if (section.type === "questions") return { ...base, questions: section.questions.length };
		return {
			...base,
			questions: section.block.status.length + section.block.followUps.length,
			groups: section.groups.map((group) => ({ title: group.title, items: group.items.length })),
			status: section.block.status.map((question) =>
				"options" in question ? question.options.map((option) => option.label) : [],
			),
			followUps: section.block.followUps.length,
		};
	});
}

/**
 * Turns a Tally form into a definition. The input is the JSON of the form page's
 * `__NEXT_DATA__` script, as an object or as text, or the saved page itself.
 *
 * The wording, the options and the rules are kept as they are. Pages that write the same
 * questions out once per item are folded into a `repeat` section, unless the copies differ in
 * more than the item's name: then they are left as they were and the report says where.
 */
export function importTally(input: unknown, options: ImportOptions = {}): ImportResult {
	const data = typeof input === "string" ? parseText(input) : input;
	const form = readTallyForm(data);
	if (!form) {
		return {
			ok: false,
			problems: [
				"This is not a Tally form page's data. It should be the JSON of the page's __NEXT_DATA__ script, with its blocks under props.pageProps.",
			],
		};
	}
	const raw = readForm(form);
	if (raw.problems.length > 0) return { ok: false, problems: raw.problems };

	const notes = new Set(raw.notes);
	const pages = raw.pages.filter((page) => page.elements.length > 0);
	const title = raw.title || "Untitled form";
	const definition: DefinitionInput = {
		version: 1,
		id: options.id ?? (slug(title) || "form"),
		title,
		sections: [],
	};

	const [first] = pages;
	const consent = first && readConsent(first);
	if (consent) {
		definition.consent = consent;
		pages.shift();
	}
	const thanks = pages.filter((page) => page.thankYou);
	const [end] = thanks;
	if (end) {
		const { title: endTitle, rest } = pageTitle(end);
		const text = rest.flatMap((element) => (element.kind === "text" ? paragraphsOf(element) : []));
		definition.end = { ...(endTitle ? { title: endTitle } : {}), ...(text.length ? { text } : {}) };
	}

	const drafts: Draft[] = [];
	const folded: Array<{ draft: Draft; pages: number[]; items: number; settled: Difference[] }> = [];
	const refused: RefusedRun[] = [];
	const asked = pages.filter((page) => !page.thankYou);
	for (let index = 0; index < asked.length; ) {
		const page = asked[index] as RawPage;
		const run: CopiesPage[] = [];
		if (options.fold !== false) {
			// Consecutive pages of copies that ask the same questions are one run.
			for (let next = index; next < asked.length; next++) {
				const copies = readCopies(asked[next] as RawPage);
				const previous = run[run.length - 1];
				if (!copies || (previous && !sameQuestions(previous, copies))) break;
				run.push(copies);
			}
		}
		const items = run.reduce((count, copies) => count + copies.copies.length, 0);
		const result =
			items >= 2 ? foldPages(run, options.acceptDifferences === true, notes) : undefined;
		if (result && "groups" in result) {
			// A page of text alone, right before the run, introduces it.
			const before = drafts[drafts.length - 1];
			const introduces =
				before?.type === "questions" &&
				before.questions.length === 0 &&
				before.page === page.number - 1;
			if (introduces) drafts.pop();
			const [only] = result.groups;
			const draft: Draft = {
				type: "repeat",
				title: introduces ? before.title : (only?.title ?? `Page ${page.number}`),
				text: introduces ? before.text : [],
				run: result,
			};
			if (!introduces && result.groups.length > 1) {
				notes.add(
					"A repeat section took its title from its first group: no page of text introduced it.",
				);
			}
			drafts.push(draft);
			folded.push({ draft, pages: result.pages, items, settled: result.settled });
			index += run.length;
			continue;
		}
		// A refused run stays as it was written, all of it: folding the pages that happen to
		// agree would split one list of items in two.
		if (result) refused.push(result);
		const unfolded = result ? run.map((copies) => copies.page) : [page];
		for (const left of unfolded) drafts.push(questionsDraft(left, notes));
		index += unfolded.length;
	}

	const emitter = new Emitter();
	emitter.name(drafts);
	const sections = new Map<Draft, string>();
	for (const draft of drafts) {
		const section = emitter.section(draft);
		sections.set(draft, section.id);
		definition.sections.push(section);
	}
	for (const note of emitter.notes) notes.add(note);
	if (options.detachEmail) detachEmail(definition);

	const parsed = parseDefinition(definition);
	if (!parsed.ok) {
		return {
			ok: false,
			problems: [
				"The form was read, but what it became is not a valid definition:",
				...formatProblems(parsed.problems).split("\n"),
			],
		};
	}
	return {
		ok: true,
		definition: parsed.definition,
		report: {
			title,
			source: { pages: raw.pages.length, blocks: raw.blocks, rules: raw.rules },
			hasConsent: consent !== undefined,
			sections: summarise(parsed.definition),
			notes: [...notes],
			folded: folded.map(({ draft, ...rest }) => ({ section: sections.get(draft) ?? "", ...rest })),
			refused,
		},
	};
}

function parseText(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return extractPageData(text);
	}
}
