import type { Paragraph } from "@gateweave/forms-schema";
import type { RawCondition, RawElement, RawPage, RawQuestion, RawText } from "./read";
import { isFormatted, oneLine } from "./rich-text";

/** Stands for the item's name in a wording until the fold knows which merge field to write. */
export const NAME = "⟦item⟧";

/** A question with the text that stands above it on its page. */
export interface Asked {
	question: RawQuestion;
	description: Paragraph[];
	detail: Paragraph[];
}

/** One item's copy of the repeated questions, as the source wrote it out. */
export interface Copy {
	label: string;
	definition: RawText[];
	detail: Paragraph[];
	asked: Asked[];
}

/** A page that is nothing but copies, each under its own heading. */
export interface CopiesPage {
	page: RawPage;
	title: string | undefined;
	copies: Copy[];
}

/** Where one copy is not like the others. */
export interface Difference {
	/** The item's label. */
	item: string;
	/** Which part of the copy, such as `question 3, required`. */
	where: string;
	found: string;
	/** What most copies have there. */
	expected: string;
}

export interface FoldedItem {
	label: string;
	name: string | undefined;
	definition: string | undefined;
	detail: Paragraph[];
}

export interface FoldedRun {
	pages: number[];
	groups: Array<{ title: string | undefined; items: FoldedItem[] }>;
	/** The questions asked for every item, their wording using `NAME` for the item's name. */
	questions: RawQuestion[];
	/** Whether any item's name differs from its label, so the wording must merge the name. */
	named: boolean;
	/** The differences that were settled by taking what most copies have. Empty when strict. */
	settled: Difference[];
}

export interface RefusedRun {
	pages: number[];
	items: number;
	/** Why the copies could not be folded, when it is not a list of differences. */
	reason?: string;
	differences: Difference[];
}

/** The words of a page's own title: its first block when that is a top heading. */
export function pageTitle(page: RawPage): { title: string | undefined; rest: RawElement[] } {
	const [first, ...rest] = page.elements;
	if (first?.kind === "text" && first.heading === 1) return { title: oneLine(first.text), rest };
	return { title: undefined, rest: page.elements };
}

/** A text block as paragraphs. A heading inside a page becomes a bold line. */
export function paragraphsOf(text: RawText): Paragraph[] {
	return text.heading ? [[{ text: oneLine(text.text), bold: true }]] : text.text;
}

/**
 * Hangs the text between questions on the question after it: what stands above an input is
 * about that input. Text revealed by a tick becomes the question's detail. The questions
 * themselves are left as they were read.
 */
export function gatherQuestions(elements: RawElement[]): {
	asked: Asked[];
	/** Text after the last question, which has no question to belong to. */
	trailing: Paragraph[];
} {
	const asked: Asked[] = [];
	let description: Paragraph[] = [];
	let detail: Paragraph[] = [];
	for (const element of elements) {
		if (element.kind === "text") {
			if (element.disclosed) detail.push(...paragraphsOf(element));
			else description.push(...paragraphsOf(element));
			continue;
		}
		asked.push({
			question: element,
			description: [...description, ...element.description],
			detail: [...detail, ...element.detail],
		});
		description = [];
		detail = [];
	}
	return { asked, trailing: [...description, ...detail] };
}

/**
 * Reads a page as copies: every heading below the page's title starts an item, and the page
 * holds nothing else. Returns nothing for any other page.
 */
export function readCopies(page: RawPage): CopiesPage | undefined {
	const { title, rest } = pageTitle(page);
	const levels = rest.flatMap((element) =>
		element.kind === "text" && element.heading && element.heading > 1 ? [element.heading] : [],
	);
	if (levels.length === 0) return undefined;
	const level = Math.min(...levels);
	const isItem = (element: RawElement) => element.kind === "text" && element.heading === level;
	if (!rest[0] || !isItem(rest[0])) return undefined;

	const copies: Copy[] = [];
	let chunk: RawElement[] = [];
	const close = (): boolean => {
		const [heading, ...body] = chunk;
		if (heading?.kind !== "text") return true;
		const firstAsked = body.findIndex((element) => element.kind === "question");
		if (firstAsked < 0) return false;
		// Above an item's first question stands what the item is: a line or two saying so, and
		// the longer text a tick reveals.
		const lead = body.slice(0, firstAsked) as RawText[];
		const { asked, trailing } = gatherQuestions(body.slice(firstAsked));
		if (trailing.length > 0) return false;
		copies.push({
			label: oneLine(heading.text),
			definition: lead.filter((text) => !text.disclosed),
			detail: lead.filter((text) => text.disclosed).flatMap(paragraphsOf),
			asked,
		});
		return true;
	};
	for (const element of rest) {
		if (isItem(element)) {
			if (!close()) return undefined;
			chunk = [];
		}
		chunk.push(element);
	}
	if (!close()) return undefined;
	return { page, title, copies };
}

/** A condition with its questions and options named by position, so two copies' can be compared. */
function ruleShape(condition: RawCondition, questions: RawQuestion[]): string {
	if (condition.op === "all" || condition.op === "any") {
		return `${condition.op}(${condition.parts.map((part) => ruleShape(part, questions)).join(",")})`;
	}
	if (condition.op === "not") return `not(${ruleShape(condition.part, questions)})`;
	const own = questions.indexOf(condition.question);
	// A question outside the copy has to be the very same one for every copy.
	const asked = own >= 0 ? `question ${own + 1}` : `outside:${condition.question.refs[0]}`;
	if (condition.op === "answered") return `${asked} answered ${condition.answered}`;
	if (condition.op === "includes") return `${asked} includes option ${condition.option + 1}`;
	const row = condition.row === undefined ? "" : ` row ${condition.row + 1}`;
	const to =
		condition.option === undefined
			? JSON.stringify(condition.value)
			: `option ${condition.option + 1}`;
	return `${asked}${row} ${condition.op} ${to}`;
}

/** What a copy asks, without any wording: the kinds of its questions and what its rules do. */
function skeleton(copy: Copy): string[] {
	const questions = copy.asked.map((asked) => asked.question);
	return questions.map((question) => {
		const rules = question.shownBy.map((condition) => ruleShape(condition, questions));
		const counts = [
			[question.options.length, "options"],
			[question.rows.length, "rows"],
			[question.columns.length, "columns"],
			[question.fields.length, "fields"],
		]
			.filter(([count]) => count !== 0)
			.map(([count, what]) => `${count} ${what}`);
		return [
			question.type.replace("_", " "),
			...counts,
			rules.length > 0 ? `shown when ${rules.join(" or ")}` : "always shown",
		].join(", ");
	});
}

type Fix = (key: string, text: string) => string;

function fixParagraphs(paragraphs: Paragraph[], fix: (text: string) => string): Paragraph[] {
	return paragraphs.map((paragraph) =>
		typeof paragraph === "string"
			? fix(paragraph)
			: paragraph.map((span) => ({ ...span, text: fix(span.text) })),
	);
}

/**
 * Every wording of a copy, each under a key that says where it is. `fix` may change a text on
 * the way, which is how the item's name is taken out.
 */
function wordings(copy: Copy, fix: Fix = (_key, text) => text): Map<string, string> {
	const found = new Map<string, string>();
	const set = (key: string, text: string): void => {
		found.set(key, fix(key, text));
	};
	const setRich = (key: string, text: Paragraph[]): void => {
		found.set(key, JSON.stringify(fixParagraphs(text, (part) => fix(key, part))));
	};
	copy.asked.forEach(({ question, description, detail }, index) => {
		const at = `question ${index + 1}`;
		set(`${at}, wording`, question.title);
		setRich(`${at}, text under it`, description);
		setRich(`${at}, text behind "more"`, detail);
		set(`${at}, placeholder`, question.placeholder);
		question.options.forEach((option, n) => {
			set(`${at}, option ${n + 1}`, option.label);
		});
		question.rows.forEach((row, n) => {
			set(`${at}, row ${n + 1}`, row.label);
		});
		question.columns.forEach((column, n) => {
			set(`${at}, column ${n + 1}`, column.label);
		});
		question.fields.forEach((field, n) => {
			set(`${at}, field ${n + 1}`, field.label);
			set(`${at}, field ${n + 1}, placeholder`, field.placeholder);
		});
	});
	return found;
}

/** Everything else a copy sets, as text. */
function settings(copy: Copy): Map<string, string> {
	const found = new Map<string, string>();
	copy.asked.forEach(({ question }, index) => {
		const at = `question ${index + 1}`;
		found.set(`${at}, required`, question.required ? "yes" : "no");
		found.set(`${at}, most choices`, String(question.max ?? "no limit"));
		found.set(`${at}, smallest number`, String(question.numberMin ?? "none"));
		found.set(`${at}, largest number`, String(question.numberMax ?? "none"));
		question.options.forEach((option, n) => {
			found.set(`${at}, option ${n + 1}, asks for text`, option.specify ? "yes" : "no");
		});
		question.fields.forEach((field, n) => {
			found.set(`${at}, field ${n + 1}, required`, field.required ? "yes" : "no");
		});
	});
	return found;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a name where it stands as words of its own, not inside a longer word. */
function nameMatcher(name: string): RegExp {
	return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "gu");
}

/**
 * What a copy's wordings call its item: the longest run of the heading's words that the
 * wordings which differ between copies contain. A heading may say more than the name ("B2: Rye
 * bread" above "Have you made Rye bread?").
 */
function nameOf(label: string, varying: string[]): string | undefined {
	const words = label.split(/\s+/).filter(Boolean);
	const runs: string[] = [];
	for (let from = 0; from < words.length; from++) {
		for (let to = from + 1; to <= words.length; to++) {
			runs.push(words.slice(from, to).join(" "));
		}
	}
	runs.sort((a, b) => b.length - a.length);
	return runs.find((run) => varying.some((text) => nameMatcher(run).test(text)));
}

function mostCommon(values: string[]): string {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	let best = values[0] ?? "";
	for (const [value, count] of counts) {
		if (count > (counts.get(best) ?? 0)) best = value;
	}
	return best;
}

/** A copy of a condition that points at the cloned questions instead of the originals. */
function retarget(condition: RawCondition, clones: Map<RawQuestion, RawQuestion>): RawCondition {
	if (condition.op === "all" || condition.op === "any") {
		return { ...condition, parts: condition.parts.map((part) => retarget(part, clones)) };
	}
	if (condition.op === "not") return { ...condition, part: retarget(condition.part, clones) };
	return { ...condition, question: clones.get(condition.question) ?? condition.question };
}

/** New questions like one copy's, whose rules point at each other and not at the originals. */
function cloneQuestions(asked: Asked[]): RawQuestion[] {
	const clones = new Map<RawQuestion, RawQuestion>();
	for (const { question } of asked) {
		clones.set(question, {
			...question,
			options: question.options.map((option) => ({ ...option })),
			rows: question.rows.map((row) => ({ ...row })),
			columns: question.columns.map((column) => ({ ...column })),
			fields: question.fields.map((field) => ({ ...field })),
		});
	}
	for (const clone of clones.values()) {
		clone.shownBy = clone.shownBy.map((condition) => retarget(condition, clones));
	}
	return [...clones.values()];
}

/** Writes the agreed wordings and settings into the questions that will stand for every copy. */
function applyShape(
	questions: RawQuestion[],
	wording: Map<string, string>,
	setting: Map<string, string>,
): void {
	const text = (key: string) => wording.get(key) ?? "";
	const rich = (key: string) => JSON.parse(wording.get(key) ?? "[]") as Paragraph[];
	questions.forEach((question, index) => {
		const at = `question ${index + 1}`;
		const limit = (key: string) => {
			const value = Number(setting.get(`${at}, ${key}`));
			return Number.isFinite(value) ? value : undefined;
		};
		question.title = text(`${at}, wording`);
		question.description = rich(`${at}, text under it`);
		question.detail = rich(`${at}, text behind "more"`);
		question.placeholder = text(`${at}, placeholder`);
		question.required = setting.get(`${at}, required`) === "yes";
		question.options.forEach((option, n) => {
			option.label = text(`${at}, option ${n + 1}`);
			option.specify = setting.get(`${at}, option ${n + 1}, asks for text`) === "yes";
		});
		question.rows.forEach((row, n) => {
			row.label = text(`${at}, row ${n + 1}`);
		});
		question.columns.forEach((column, n) => {
			column.label = text(`${at}, column ${n + 1}`);
		});
		question.fields.forEach((field, n) => {
			field.label = text(`${at}, field ${n + 1}`);
			field.placeholder = text(`${at}, field ${n + 1}, placeholder`);
			field.required = setting.get(`${at}, field ${n + 1}, required`) === "yes";
		});
		const max = limit("most choices");
		const numberMin = limit("smallest number");
		const numberMax = limit("largest number");
		delete question.max;
		delete question.numberMin;
		delete question.numberMax;
		if (max !== undefined) question.max = max;
		if (numberMin !== undefined) question.numberMin = numberMin;
		if (numberMax !== undefined) question.numberMax = numberMax;
	});
}

function itemOf(copy: Copy, name: string | undefined, notes: Set<string>): FoldedItem {
	const texts = copy.definition.flatMap(paragraphsOf);
	if (texts.length > 0 && isFormatted(texts)) {
		notes.add(
			"An item's one-line definition is plain text: bold, italic and links in it were dropped.",
		);
	}
	return {
		label: copy.label,
		name: name === copy.label ? undefined : name,
		definition: texts.length > 0 ? oneLine(texts) : undefined,
		detail: copy.detail,
	};
}

/** The shape most of a page's copies have. */
function usualSkeleton(copies: Copy[]): string {
	return mostCommon(copies.map((copy) => JSON.stringify(skeleton(copy))));
}

/** Whether two pages of copies ask the same questions, so that they belong to one run. */
export function sameQuestions(a: CopiesPage, b: CopiesPage): boolean {
	return usualSkeleton(a.copies) === usualSkeleton(b.copies);
}

/**
 * Folds consecutive pages of copies into one run, when every copy asks the same questions with
 * the same options and rules, in wordings that differ only by the item's name.
 *
 * It refuses when the copies differ in anything else, and says where. With `accept`, it takes
 * what most copies have instead and lists every place it did so: a form copied forty times by
 * hand has slips in it, and whether they matter is for a person to decide.
 */
export function foldPages(
	pages: CopiesPage[],
	accept: boolean,
	notes: Set<string>,
): FoldedRun | RefusedRun {
	const copies = pages.flatMap((page) => page.copies);
	const numbers = pages.map((page) => page.page.number);
	const refuse = (reason: string | undefined, differences: Difference[] = []): RefusedRun => ({
		pages: numbers,
		items: copies.length,
		...(reason ? { reason } : {}),
		differences,
	});

	// What the copies ask has to match before their wordings can be compared at all. Taking
	// what most copies have cannot settle this: a copy with other questions is another block.
	const usual = usualSkeleton(copies);
	const usualShape = JSON.parse(usual) as string[];
	const odd = copies.filter((copy) => JSON.stringify(skeleton(copy)) !== usual);
	if (odd.length > 0) {
		return refuse(
			"Some items do not ask the same questions as the others.",
			odd.map((copy) => {
				const own = skeleton(copy);
				const at = own.findIndex((line, index) => line !== usualShape[index]);
				const inside = at >= 0 && at < usualShape.length;
				return {
					item: copy.label,
					where: inside ? `question ${at + 1}` : "its questions",
					found: inside ? (own[at] ?? "") : `${own.length} questions`,
					expected: inside ? (usualShape[at] ?? "") : `${usualShape.length} questions`,
				};
			}),
		);
	}

	const worded = copies.map((copy) => wordings(copy));
	const keys = [...(worded[0]?.keys() ?? [])];
	const varying = new Set(
		keys.filter((key) => new Set(worded.map((own) => own.get(key))).size > 1),
	);
	const names = copies.map((copy, index) =>
		nameOf(
			copy.label,
			[...varying].map((key) => worded[index]?.get(key) ?? ""),
		),
	);
	// The name is taken out only where copies differ: a wording all copies share is not about
	// the item, even when it happens to hold one item's name.
	const templated = copies.map((copy, index) => {
		const name = names[index];
		if (!name) return worded[index] ?? new Map<string, string>();
		return wordings(copy, (key, text) =>
			varying.has(key) ? text.replace(nameMatcher(name), NAME) : text,
		);
	});

	const differences: Difference[] = [];
	const agree = (
		maps: Array<Map<string, string>>,
		show: (text: string, index: number) => string,
	) => {
		const agreed = new Map<string, string>();
		for (const key of maps[0]?.keys() ?? []) {
			const values = maps.map((own) => own.get(key) ?? "");
			const expected = mostCommon(values);
			agreed.set(key, expected);
			values.forEach((value, index) => {
				if (value === expected) return;
				differences.push({
					item: copies[index]?.label ?? "",
					where: key,
					found: show(value, index),
					expected: show(expected, index),
				});
			});
		}
		return agreed;
	};
	const wording = agree(templated, (text, index) => text.replaceAll(NAME, names[index] ?? "…"));
	const setting = agree(copies.map(settings), (text) => text);
	if (differences.length > 0 && !accept) return refuse(undefined, differences);

	const questions = cloneQuestions(copies[0]?.asked ?? []);
	applyShape(questions, wording, setting);
	const always = questions.filter((question) => question.shownBy.length === 0);
	if (always.length === 0) {
		return refuse(
			"Every question of an item is shown by a rule, so there is nothing to ask each item first.",
		);
	}
	const notOneTap = always.find((question) => question.type !== "single_choice");
	if (notOneTap) {
		return refuse(
			`A question asked for every item ("${notOneTap.title.replaceAll(NAME, "…")}") is not a single choice, which a card needs to be answered with one tap.`,
		);
	}

	let at = 0;
	const groups = pages.map((page) => ({
		title: page.title ?? page.page.name,
		items: page.copies.map((copy) => itemOf(copy, names[at++], notes)),
	}));
	return {
		pages: numbers,
		groups,
		questions,
		named: groups.some((group) => group.items.some((item) => item.name !== undefined)),
		settled: differences,
	};
}
