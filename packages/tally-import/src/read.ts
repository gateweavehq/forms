import type { Paragraph, QuestionType, RichText } from "@gateweave/forms-schema";
import { decodeEntities, oneLine, richText } from "./rich-text";
import { flagOf, isSet, numberOf, type TallyBlock, type TallyForm, textOf } from "./tally";

export interface RawOption {
	/** The uuid a rule names this option by. */
	ref: string;
	label: string;
	specify: boolean;
}

export interface RawRow {
	ref: string;
	label: string;
}

export interface RawField {
	ref: string;
	label: string;
	placeholder: string;
	/** Tally marks each input required by itself, so each field keeps its own. */
	required: boolean;
}

/**
 * A condition as Tally's rules state it, pointing at the questions and options themselves. It
 * becomes a definition's `Condition` once those have ids.
 */
export type RawCondition =
	| RawComparison
	| { op: "includes"; question: RawQuestion; option: number }
	| { op: "answered"; question: RawQuestion; answered: boolean }
	| { op: "all"; parts: RawCondition[] }
	| { op: "any"; parts: RawCondition[] }
	| { op: "not"; part: RawCondition };

/** `is` or `isNot`: an option by its position, or a text or number as written. */
export interface RawComparison {
	op: "is" | "isNot";
	question: RawQuestion;
	/** The row of a grid, or the field of a question with several, by position. */
	row?: number;
	option?: number;
	value?: string | number;
}

interface Shown {
	/** Tally's `isHidden`: not shown until a rule shows it. */
	hidden: boolean;
	/** The conditions of the rules that show it. Any one of them is enough. */
	shownBy: RawCondition[];
}

export interface RawText extends Shown {
	kind: "text";
	refs: string[];
	text: RichText;
	/** Set for a heading block: 1 is the page's, 2 and 3 are inside it. */
	heading?: 1 | 2 | 3;
	/** Revealed by a tick that does nothing else: the longer detail behind a "more" control. */
	disclosed?: boolean;
}

export interface RawQuestion extends Shown {
	kind: "question";
	type: QuestionType;
	/** The uuids a rule may name it by: its input's group, and its title's. */
	refs: string[];
	title: string;
	description: Paragraph[];
	detail: Paragraph[];
	required: boolean;
	placeholder: string;
	options: RawOption[];
	rows: RawRow[];
	columns: RawRow[];
	fields: RawField[];
	max?: number;
	numberMin?: number;
	numberMax?: number;
	/** A single tick box with no title: a consent, or a control that reveals text. */
	lone: boolean;
	/** The page it is on, from 1. */
	page: number;
}

export type RawElement = RawText | RawQuestion;

export interface RawPage {
	/** From 1. */
	number: number;
	/** The name its author gave the page, if any. */
	name?: string;
	/** Tally's page shown after submitting. */
	thankYou: boolean;
	elements: RawElement[];
}

export interface RawForm {
	title: string;
	pages: RawPage[];
	/** How many blocks and rules the source has, for the report. */
	blocks: number;
	rules: number;
	/** What was changed or left out on the way, for a person to read. */
	notes: string[];
	/** What stops the import: something the definition cannot hold. */
	problems: string[];
	/** The payload keys the importer does not read and that are set to something, by block type. */
	unread: Map<string, Set<string>>;
}

interface Title extends Shown {
	kind: "title";
	refs: string[];
	text: string;
}

interface RuleBlock {
	kind: "rule";
	block: TallyBlock;
	page: number;
}

type Piece = RawText | RawQuestion | Title | RuleBlock;

const INPUTS: Record<string, QuestionType> = {
	INPUT_TEXT: "short_text",
	TEXTAREA: "long_text",
	INPUT_NUMBER: "number",
	INPUT_EMAIL: "email",
	MULTIPLE_CHOICE_OPTION: "single_choice",
	CHECKBOX: "multiple_choice",
	DROPDOWN_OPTION: "dropdown",
	RANKING_OPTION: "ranking",
	MATRIX: "grid",
	MATRIX_COLUMN: "grid",
	MATRIX_ROW: "grid",
};

const HEADINGS: Record<string, 1 | 2 | 3> = { HEADING_1: 1, HEADING_2: 2, HEADING_3: 3 };

/** The keys of a block's payload that the importer reads, on some type of block or other. */
const READ_KEYS = new Set([
	"safeHTMLSchema",
	"text",
	"title",
	"name",
	"placeholder",
	"isHidden",
	"isRequired",
	"isOtherOption",
	"allowMultiple",
	"hasMaxChoices",
	"maxChoices",
	"hasMinNumber",
	"minNumber",
	"hasMaxNumber",
	"maxNumber",
	"randomize",
	"isThankYouPage",
	"logicalOperator",
	"conditionals",
	"actions",
	"hiddenFields",
	// Where a block stands among its siblings, which the order of the list already says.
	"index",
	"isFirst",
	"isLast",
	// Set on every option of a group that has an "Other" option; `isOtherOption` marks the one.
	"hasOtherOption",
]);

/** Counts things of one kind so that a note says "40 rules …" once, not forty times. */
class Counts {
	readonly #counts = new Map<string, number>();
	add(key: string): void {
		this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
	}
	entries(): Array<[string, number]> {
		return [...this.#counts];
	}
}

function plural(count: number, one: string, many: string): string {
	return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

function label(block: TallyBlock): string {
	const plain = textOf(block.payload, "text");
	if (plain !== undefined) return decodeEntities(plain).replace(/\s+/g, " ").trim();
	return oneLine(richText(block.payload.safeHTMLSchema));
}

function question(type: QuestionType, block: TallyBlock, page: number): RawQuestion {
	return {
		kind: "question",
		type,
		refs: [block.groupUuid],
		title: "",
		description: [],
		detail: [],
		required: flagOf(block.payload, "isRequired"),
		hidden: flagOf(block.payload, "isHidden"),
		shownBy: [],
		placeholder: textOf(block.payload, "placeholder")?.trim() ?? "",
		options: [],
		rows: [],
		columns: [],
		fields: [],
		lone: false,
		page,
	};
}

/** Builds the question of an input: the blocks from `start` that share its group. */
function readInput(
	blocks: TallyBlock[],
	start: number,
	page: number,
	notes: Counts,
): { question: RawQuestion; next: number } {
	const first = blocks[start] as TallyBlock;
	const type = INPUTS[first.type] as QuestionType;
	const group: TallyBlock[] = [];
	let next = start;
	while (next < blocks.length) {
		const block = blocks[next] as TallyBlock;
		if (block.groupUuid !== first.groupUuid || INPUTS[block.type] !== type) break;
		group.push(block);
		next++;
	}
	const made = question(type, first, page);
	if (group.some((block) => flagOf(block.payload, "randomize"))) notes.add("randomize");

	if (type === "grid") {
		for (const block of group) {
			const entry = { ref: block.uuid, label: label(block) };
			if (block.type === "MATRIX_COLUMN") made.columns.push(entry);
			else if (block.type === "MATRIX_ROW") made.rows.push(entry);
		}
		if (made.rows.length === 1) {
			// One row with one choice is a single choice drawn as a table. The row's own label
			// ("Options", say) only filled the table's first cell.
			made.type = "single_choice";
			made.options = made.columns.map((column) => ({ ...column, specify: false }));
			made.refs.push((made.rows[0] as RawRow).ref);
			made.rows = [];
			made.columns = [];
			notes.add("one-row grid");
		}
		return { question: made, next };
	}

	if (type === "single_choice" || type === "multiple_choice" || type === "dropdown") {
		made.options = group.map((block) => ({
			ref: block.uuid,
			label: label(block),
			specify: flagOf(block.payload, "isOtherOption"),
		}));
	} else if (type === "ranking") {
		made.options = group.map((block) => ({ ref: block.uuid, label: label(block), specify: false }));
	}
	if (type === "single_choice" && flagOf(first.payload, "allowMultiple")) {
		made.type = "multiple_choice";
	}
	if (flagOf(first.payload, "hasMaxChoices")) {
		const max = numberOf(first.payload, "maxChoices");
		if (max !== undefined && made.type === "multiple_choice") made.max = max;
	}
	if (type === "number") {
		if (flagOf(first.payload, "hasMinNumber")) {
			const min = numberOf(first.payload, "minNumber");
			if (min !== undefined) made.numberMin = min;
		}
		if (flagOf(first.payload, "hasMaxNumber")) {
			const max = numberOf(first.payload, "maxNumber");
			if (max !== undefined) made.numberMax = max;
		}
	}
	made.lone = first.type === "CHECKBOX" && group.length === 1;
	return { question: made, next };
}

/** The flat blocks as pieces, page by page, with each input's blocks gathered into a question. */
function readPieces(form: TallyForm, raw: RawForm, notes: Counts): Piece[][] {
	const pages: Piece[][] = [[]];
	const unknown = new Counts();
	const { blocks } = form;
	let index = 0;
	while (index < blocks.length) {
		const block = blocks[index] as TallyBlock;
		const pieces = pages[pages.length - 1] as Piece[];
		const page = pages.length;
		const shown = { hidden: flagOf(block.payload, "isHidden"), shownBy: [] };
		index++;
		for (const [key, value] of Object.entries(block.payload)) {
			if (READ_KEYS.has(key) || !isSet(value)) continue;
			const keys = raw.unread.get(block.type) ?? new Set<string>();
			raw.unread.set(block.type, keys.add(key));
		}

		if (block.type === "PAGE_BREAK") {
			pages.push([]);
			const name = textOf(block.payload, "name")?.trim();
			raw.pages.push({
				number: pages.length,
				...(name ? { name } : {}),
				thankYou: flagOf(block.payload, "isThankYouPage"),
				elements: [],
			});
		} else if (block.type === "FORM_TITLE") {
			raw.title = label(block) || raw.title;
		} else if (block.type === "DIVIDER") {
			// A line between blocks says nothing.
		} else if (block.type === "HIDDEN_FIELDS") {
			notes.add("hidden fields");
		} else if (block.type === "CONDITIONAL_LOGIC") {
			raw.rules++;
			pieces.push({ kind: "rule", block, page });
		} else if (block.type === "TITLE") {
			pieces.push({
				kind: "title",
				refs: [block.uuid, block.groupUuid],
				text: label(block),
				...shown,
			});
		} else if (block.type === "TEXT" || HEADINGS[block.type]) {
			const text = richText(block.payload.safeHTMLSchema);
			const heading = HEADINGS[block.type];
			if (text) {
				pieces.push({
					kind: "text",
					refs: [block.uuid, block.groupUuid],
					text: heading ? [oneLine(text)] : text,
					...(heading ? { heading } : {}),
					...shown,
				});
			}
		} else if (INPUTS[block.type]) {
			const input = readInput(blocks, index - 1, page, notes);
			pieces.push(input.question);
			index = input.next;
		} else {
			unknown.add(block.type);
		}
	}
	for (const [type, count] of unknown.entries()) {
		raw.problems.push(
			`${plural(count, "block", "blocks")} of type ${type} cannot be imported: Forms has nothing to turn it into yet.`,
		);
	}
	return pages;
}

/** Whether a text can label a field: plain words that are always there. */
function isPlainLabel(piece: Piece): piece is RawText {
	return piece.kind === "text" && !piece.heading && !piece.hidden;
}

/**
 * Gives each input its title and the text between the two, and joins a run of text fields under
 * one title into one question: Tally has no question with several fields, so its authors write a
 * title, then a line of text and an input for each field.
 */
function attach(pieces: Piece[], notes: Counts): Array<RawElement | RuleBlock> {
	const out: Array<RawElement | RuleBlock> = [];
	let title: Title | undefined;
	let between: RawText[] = [];

	/** A title that no input followed is text after all. */
	const flushTitle = () => {
		if (title?.text) {
			out.push({
				kind: "text",
				refs: title.refs,
				text: [[{ text: title.text, bold: true }]],
				hidden: title.hidden,
				shownBy: title.shownBy,
			});
		}
		out.push(...between);
		title = undefined;
		between = [];
	};

	for (const piece of pieces) {
		if (piece.kind === "title") {
			flushTitle();
			title = piece;
		} else if (piece.kind === "text") {
			if (title) between.push(piece);
			else out.push(piece);
		} else if (piece.kind === "rule") {
			out.push(piece);
		} else if (title) {
			piece.title = title.text;
			piece.refs.push(...title.refs);
			piece.description = between.flatMap((text) => text.text);
			out.push(piece);
			title = undefined;
			between = [];
		} else if (joinFields(out, piece)) {
			notes.add("joined field");
		} else {
			if (piece.lone) {
				piece.title = piece.options[0]?.label ?? "";
			} else {
				// An input with no title takes the text right above it as its question.
				const above = out[out.length - 1];
				if (above && isPlainLabel(above) && above.shownBy.length === 0) {
					piece.title = oneLine(above.text);
					out.pop();
				}
			}
			out.push(piece);
		}
	}
	flushTitle();
	return out;
}

/**
 * Adds a short text input to the question before it as one more field, when only plain text
 * stands between the two. Says whether it did.
 */
function joinFields(out: Array<RawElement | RuleBlock>, input: RawQuestion): boolean {
	if (input.type !== "short_text") return false;
	let at = out.length - 1;
	while (at >= 0 && isPlainLabel(out[at] as Piece)) at--;
	const labels = out.slice(at + 1) as RawText[];
	const before = out[at];
	if (labels.length === 0 || before?.kind !== "question") return false;
	if (before.type !== "short_text" && before.type !== "fields") return false;
	if (before.hidden !== input.hidden || before.title === "") return false;

	if (before.type === "short_text") {
		before.type = "fields";
		before.fields = [
			{
				ref: before.refs[0] as string,
				label: oneLine(before.description) || before.placeholder || "1",
				placeholder: before.placeholder,
				required: before.required,
			},
		];
		// What was required was that one input. The question as a whole is not: marking it so
		// would make every field required, the ones Tally left optional too.
		before.required = false;
		before.description = [];
		before.placeholder = "";
	}
	before.fields.push({
		ref: input.refs[0] as string,
		label: labels.map((text) => oneLine(text.text)).join(" "),
		placeholder: input.placeholder,
		required: input.required,
	});
	out.length = at + 1;
	return true;
}

interface Target {
	question: RawQuestion;
	/** The row of a grid or the field of a question with fields that a rule reads. */
	row?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One of a rule's conditions, or the reason it cannot be imported. */
function readCondition(conditional: unknown, fields: Map<string, Target>): RawCondition | string {
	if (!isRecord(conditional) || conditional.type !== "SINGLE" || !isRecord(conditional.payload)) {
		const type = isRecord(conditional) ? String(conditional.type) : "unknown";
		return `a condition of type ${type}`;
	}
	const { field, comparison, value } = conditional.payload;
	const target =
		isRecord(field) && typeof field.uuid === "string" ? fields.get(field.uuid) : undefined;
	if (!target) return "a condition on a field that is not in the form";
	const { question: asked, row } = target;
	const choices = asked.type === "grid" ? asked.columns : asked.options;
	const option = choices.findIndex((choice) => choice.ref === value);
	const isChoice = asked.type === "single_choice" || asked.type === "dropdown";
	const isSeveral = asked.type === "multiple_choice" || asked.type === "ranking";
	const withRow = row === undefined ? {} : { row };

	switch (comparison) {
		case "IS_EMPTY":
		case "IS_NOT_EMPTY":
			return { op: "answered", question: asked, answered: comparison === "IS_NOT_EMPTY" };
		case "IS":
		case "IS_NOT": {
			const op = comparison === "IS" ? "is" : "isNot";
			if (isChoice || asked.type === "grid") {
				if (option < 0) return `${comparison} with an option that is not in the form`;
				return { op, question: asked, ...withRow, option };
			}
			if (isSeveral) return `${comparison} on a question where several options can be chosen`;
			if (asked.type === "number") {
				const number = Number(value);
				if (typeof value === "boolean" || value === "" || !Number.isFinite(number)) {
					return `${comparison} comparing a number with something else`;
				}
				return { op, question: asked, value: number };
			}
			if (typeof value !== "string") return `${comparison} comparing text with something else`;
			return { op, question: asked, ...withRow, value };
		}
		case "CONTAINS":
		case "DOES_NOT_CONTAIN": {
			if (option < 0 || !(isChoice || isSeveral)) return `${comparison} on a text`;
			const positive: RawCondition = isChoice
				? { op: "is", question: asked, option }
				: { op: "includes", question: asked, option };
			return comparison === "CONTAINS" ? positive : { op: "not", part: positive };
		}
		default:
			return `the comparison ${String(comparison)}`;
	}
}

/** Reads every rule and hangs its condition on the elements it shows. */
function readRules(pages: Array<Array<RawElement | RuleBlock>>, raw: RawForm, notes: Counts): void {
	const fields = new Map<string, Target>();
	const targets = new Map<string, RawElement>();
	for (const piece of pages.flat()) {
		if (piece.kind === "rule") continue;
		for (const ref of piece.refs) targets.set(ref, piece);
		if (piece.kind !== "question") continue;
		for (const ref of piece.refs) fields.set(ref, { question: piece });
		piece.rows.forEach((row, index) => {
			fields.set(row.ref, { question: piece, row: index });
		});
		piece.fields.forEach((field, index) => {
			fields.set(field.ref, { question: piece, row: index });
			targets.set(field.ref, piece);
		});
	}

	const unsupported = new Counts();
	for (const piece of pages.flat()) {
		if (piece.kind !== "rule") continue;
		const { payload } = piece.block;
		const conditionals = Array.isArray(payload.conditionals) ? payload.conditionals : [];
		const actions = Array.isArray(payload.actions) ? payload.actions : [];
		const parts: RawCondition[] = [];
		if (conditionals.length === 0) notes.add("rule without a condition");
		let readable = conditionals.length > 0;
		for (const conditional of conditionals) {
			const condition = readCondition(conditional, fields);
			if (typeof condition === "string") {
				unsupported.add(condition);
				readable = false;
			} else {
				parts.push(condition);
			}
		}
		for (const action of actions) {
			if (!isRecord(action) || action.type !== "SHOW_BLOCKS") {
				unsupported.add(`the action ${isRecord(action) ? String(action.type) : "unknown"}`);
				readable = false;
			}
		}
		const [only] = parts;
		if (!readable || !only) continue;
		const condition: RawCondition =
			parts.length === 1 ? only : { op: payload.logicalOperator === "OR" ? "any" : "all", parts };

		const shown = new Set<RawElement>();
		for (const action of actions) {
			const blocks = isRecord(action) && isRecord(action.payload) ? action.payload.showBlocks : [];
			for (const ref of Array.isArray(blocks) ? blocks : []) {
				const target = typeof ref === "string" ? targets.get(ref) : undefined;
				if (target) shown.add(target);
				else notes.add("dangling target");
			}
		}
		for (const target of shown) target.shownBy.push(condition);
	}
	for (const [what, count] of unsupported.entries()) {
		raw.problems.push(
			`${plural(count, "rule uses", "rules use")} ${what}, which cannot be imported.`,
		);
	}
}

function conditionsOn(condition: RawCondition, question: RawQuestion): boolean {
	if (condition.op === "all" || condition.op === "any") {
		return condition.parts.some((part) => conditionsOn(part, question));
	}
	if (condition.op === "not") return conditionsOn(condition.part, question);
	return condition.question === question;
}

/**
 * Finds the ticks that only reveal text ("Show the detailed description") and turns them into
 * what they are: the text becomes detail behind a "more" control, and the tick is not a question.
 */
function readDisclosures(pages: RawElement[][], notes: Counts): RawElement[][] {
	const all = pages.flat();
	return pages.map((elements) =>
		elements.filter((element) => {
			if (element.kind !== "question" || !element.lone) return true;
			if (element.required || element.hidden || element.shownBy.length > 0) return true;
			const dependents = all.filter((other) =>
				other.shownBy.some((condition) => conditionsOn(condition, element)),
			);
			const onlyReveals =
				dependents.length > 0 &&
				dependents.every(
					(other) =>
						other.kind === "text" &&
						other.shownBy.length === 1 &&
						other.shownBy[0]?.op === "includes",
				);
			if (!onlyReveals) return true;
			for (const text of dependents) {
				if (text.kind !== "text") continue;
				text.disclosed = true;
				text.hidden = false;
				text.shownBy = [];
			}
			notes.add("disclosure");
			return false;
		}),
	);
}

/** Leaves out what nothing ever shows, and the rules of what is shown anyway. */
function settleVisibility(pages: RawElement[][], raw: RawForm, notes: Counts): RawElement[][] {
	return pages.map((elements) =>
		elements.filter((element) => {
			if (element.hidden && element.shownBy.length === 0) {
				notes.add("never shown");
				return false;
			}
			if (!element.hidden && element.shownBy.length > 0) {
				element.shownBy = [];
				notes.add("always shown");
			}
			if (element.kind === "text" && element.shownBy.length > 0) {
				raw.problems.push(
					`Page ${pages.indexOf(elements) + 1} has text that a rule shows ("${oneLine(element.text).slice(0, 60)}"). A definition has no text that comes and goes, except behind a tick that only reveals it.`,
				);
			}
			return true;
		}),
	);
}

const NOTES: Record<string, (count: number) => string> = {
	"hidden fields": () => "Hidden fields (values passed in the form's address) were left out.",
	randomize: (count) =>
		`${plural(count, "question shuffles", "questions shuffle")} its options in Tally. The options are imported in their written order.`,
	"one-row grid": (count) =>
		`${plural(count, "grid", "grids")} with a single row became ${count === 1 ? "a single choice" : "single choices"}. The row's own label was dropped.`,
	"joined field": (count) =>
		`${plural(count, "text input", "text inputs")} with no title of ${count === 1 ? "its" : "their"} own ${count === 1 ? "was" : "were"} joined to the question above as further fields, labelled by the line of text above each.`,
	"rule without a condition": (count) =>
		`${plural(count, "rule has", "rules have")} no condition, so nothing says when ${count === 1 ? "it applies" : "they apply"}. ${count === 1 ? "It was" : "They were"} left out.`,
	"dangling target": (count) =>
		`${plural(count, "rule shows", "rules show")} a block that is no longer in the form. That part of the rule was left out.`,
	disclosure: (count) =>
		`${plural(count, "tick", "ticks")} that only revealed text became detail behind a "more" control.`,
	"never shown": (count) =>
		`${plural(count, "hidden block", "hidden blocks")} that no rule shows ${count === 1 ? "was" : "were"} left out.`,
	"always shown": (count) =>
		`${plural(count, "block", "blocks")} that a rule shows ${count === 1 ? "is" : "are"} visible anyway. The rule was left out.`,
};

/**
 * Reads a Tally form into pages of texts and questions: titles joined to their inputs, rules
 * resolved to the questions and options they name. Nothing is reworded and nothing is folded.
 */
export function readForm(form: TallyForm): RawForm {
	const raw: RawForm = {
		title: form.name?.trim() ?? "",
		pages: [{ number: 1, thankYou: false, elements: [] }],
		blocks: form.blocks.length,
		rules: 0,
		notes: [],
		problems: [],
		unread: new Map(),
	};
	const notes = new Counts();
	const attached = readPieces(form, raw, notes).map((pieces) => attach(pieces, notes));
	readRules(attached, raw, notes);
	const elements = attached.map((pieces) =>
		pieces.filter((piece): piece is RawElement => piece.kind !== "rule"),
	);
	const settled = settleVisibility(readDisclosures(elements, notes), raw, notes);
	settled.forEach((page, index) => {
		const target = raw.pages[index];
		if (target) target.elements = page;
	});
	for (const [key, count] of notes.entries()) {
		const note = NOTES[key];
		if (note) raw.notes.push(note(count));
	}
	// Named, not counted: whether "hasBadge" matters is for the person importing to judge.
	if (raw.unread.size > 0) {
		const list = [...raw.unread]
			.map(([type, keys]) => `${type}: ${[...keys].sort().join(", ")}`)
			.sort();
		raw.notes.push(`Settings of blocks that are set and were not read: ${list.join("; ")}.`);
	}
	const settings = Object.keys(form.settings)
		.filter((key) => isSet(form.settings[key]))
		.sort();
	if (settings.length > 0) {
		raw.notes.push(
			`The form's own settings are not imported (its language, look, closing, progress bar and the like): ${settings.join(", ")}.`,
		);
	}
	return raw;
}
