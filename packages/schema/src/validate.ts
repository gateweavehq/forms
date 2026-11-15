import type { z } from "zod";
import { type Definition, definitionSchema, type Question, type Section } from "./definition";
import { COUNT_FIELD, ITEM_FIELDS, mergeFields } from "./merge";
import { placesOf, type QuestionPlace } from "./places";
import { type Condition, leafConditions } from "./rules";

/** Something wrong with a definition: where it is, and what to do about it. */
export interface Problem {
	/** A path a person can follow, such as `sections[1] "breads" › block › followUps[0] "why"`. */
	where: string;
	message: string;
}

export type ParseResult = { ok: true; definition: Definition } | { ok: false; problems: Problem[] };

const QUESTION_TYPES = [
	"short_text",
	"long_text",
	"number",
	"email",
	"single_choice",
	"multiple_choice",
	"dropdown",
	"ranking",
	"grid",
	"fields",
];

const RULE_SHAPES =
	"A rule is one of { question, is }, { question, isNot }, { question, includes }, { question, answered }, { all: [...] }, { any: [...] } or { not: ... }.";

/** A form's problems as text, one to a line. */
export function formatProblems(problems: Problem[]): string {
	return problems.map(({ where, message }) => `${where}: ${message}`).join("\n");
}

/**
 * Reads a definition from untrusted input: its shape first, then what a shape cannot say (ids
 * used twice, rules that point at nothing, at themselves or forward). Every problem is reported,
 * not only the first, so a file can be fixed in one pass.
 */
export function parseDefinition(input: unknown): ParseResult {
	// Before the shape is read: reading it walks the input, and input nested without end (a
	// rule inside a rule, ten thousand times) would run that walk out of stack.
	if (nestedDeeperThan(input, MAX_NESTING)) {
		return {
			ok: false,
			problems: [
				{
					where: "the form",
					message: `Something in this definition is nested more than ${MAX_NESTING} levels deep. Nothing a form needs goes that far: a rule that combines rules that combine rules can be written flat, with one "all" or "any".`,
				},
			],
		};
	}
	const parsed = definitionSchema.safeParse(input);
	if (!parsed.success) return { ok: false, problems: shapeProblems(input, parsed.error) };
	const problems = checkDefinition(parsed.data);
	return problems.length > 0 ? { ok: false, problems } : { ok: true, definition: parsed.data };
}

/**
 * How deep a definition may nest, counting every object and list from the definition itself.
 * A rule four combinations deep sits at level ten; no form made by hand comes near this.
 */
export const MAX_NESTING = 32;

/** Whether a value holds objects or lists inside one another more than `limit` deep. */
function nestedDeeperThan(input: unknown, limit: number): boolean {
	// With a list of what is left to look at, not by calling itself: the point is to survive
	// input that a function calling itself would not.
	const left: Array<[value: unknown, depth: number]> = [[input, 1]];
	for (let next = left.pop(); next; next = left.pop()) {
		const [value, depth] = next;
		if (typeof value !== "object" || value === null) continue;
		if (depth > limit) return true;
		for (const inner of Object.values(value)) left.push([inner, depth + 1]);
	}
	return false;
}

/**
 * Ids a question cannot have: the wide export names its own columns so (`response`, `device`
 * and the rest), and a question's column is named by its id.
 */
export const RESERVED_QUESTION_IDS = [
	"response",
	"device",
	"started",
	"completed",
	"active_seconds",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A zod path as a place in the file, with the id of each object it passes through. */
function describePath(input: unknown, path: ReadonlyArray<PropertyKey>): string {
	const parts: string[] = [];
	let value = input;
	for (const key of path) {
		value = isRecord(value) || Array.isArray(value) ? Reflect.get(value, key) : undefined;
		if (typeof key === "number") {
			const id = isRecord(value) && typeof value.id === "string" ? ` "${value.id}"` : "";
			parts[parts.length - 1] = `${parts[parts.length - 1] ?? ""}[${key}]${id}`;
		} else {
			parts.push(String(key));
		}
	}
	return parts.length > 0 ? parts.join(" › ") : "the form";
}

function valueAt(input: unknown, path: ReadonlyArray<PropertyKey>): unknown {
	let value = input;
	for (const key of path) {
		value = isRecord(value) || Array.isArray(value) ? Reflect.get(value, key) : undefined;
	}
	return value;
}

function shapeProblems(input: unknown, error: z.ZodError): Problem[] {
	return error.issues.map((issue) => {
		const where = describePath(input, issue.path);
		// A question of a type that does not exist is reported at its `type`.
		const list = issue.path[issue.path.length - 3];
		const isQuestion = list === "questions" || list === "status" || list === "followUps";
		if (isQuestion && issue.path[issue.path.length - 1] === "type") {
			const type = valueAt(input, issue.path);
			return {
				where: describePath(input, issue.path.slice(0, -1)),
				message: `${JSON.stringify(type) ?? "Nothing"} is not a question type. The types are ${QUESTION_TYPES.join(", ")}.`,
			};
		}
		if (issue.code === "invalid_union" && issue.path.includes("showIf")) {
			return { where, message: RULE_SHAPES };
		}
		return { where, message: issue.message };
	});
}

/** The ids in a list that appear more than once, each named once. */
function repeated(ids: string[]): string[] {
	const seen = new Set<string>();
	const twice = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) twice.add(id);
		seen.add(id);
	}
	return [...twice];
}

function typeName(question: Question): string {
	return question.type.replace("_", " ");
}

/** The lists of ids inside one question that must not repeat, with what they are called. */
function innerIds(question: Question): Array<[string, string[]]> {
	switch (question.type) {
		case "single_choice":
		case "multiple_choice":
		case "dropdown":
		case "ranking":
			return [["option", question.options.map((option) => option.id)]];
		case "grid":
			return [
				["row", question.rows.map((row) => row.id)],
				["column", question.columns.map((column) => column.id)],
			];
		case "fields":
			return [["field", question.fields.map((field) => field.id)]];
		default:
			return [];
	}
}

/** The texts of a question that may carry merge fields: its wording and its options' labels. */
function wordings(question: Question): string[] {
	const options = "options" in question ? question.options.map((option) => option.label) : [];
	return [question.label, ...options];
}

/**
 * Checks what the shape of a definition cannot: that ids are unique, that every rule points at
 * a real, earlier question it is able to read, and that a block's questions fit the cards they
 * are asked on.
 */
export function checkDefinition(definition: Definition): Problem[] {
	const problems: Problem[] = [];
	const places = placesOf(definition);

	const sectionAt = (section: Section) =>
		`sections[${definition.sections.indexOf(section)}] "${section.id}"`;

	for (const id of repeated(definition.sections.map((section) => section.id))) {
		problems.push({
			where: "sections",
			message: `The section id "${id}" is used more than once. Give each section its own.`,
		});
	}

	const groupIds: string[] = [];
	const itemIds: string[] = [];
	const questionIds: string[] = [];

	const visit = (question: Question, where: string, place: Omit<QuestionPlace, "order">) => {
		questionIds.push(question.id);
		const inBlock = place.part !== undefined;

		if ((RESERVED_QUESTION_IDS as readonly string[]).includes(question.id)) {
			problems.push({
				where,
				message: `"${question.id}" cannot be a question's id: the export of responses has a column of that name for every form. Reserved are ${RESERVED_QUESTION_IDS.join(", ")}.`,
			});
		}

		for (const [kind, ids] of innerIds(question)) {
			for (const id of repeated(ids)) {
				problems.push({ where, message: `The ${kind} id "${id}" is used more than once.` });
			}
		}

		for (const text of wordings(question)) {
			for (const field of mergeFields(text)) {
				if (inBlock && (ITEM_FIELDS as readonly string[]).includes(field)) continue;
				problems.push({
					where,
					message: inBlock
						? `"{{${field}}}" is not a merge field. A block's question can use ${ITEM_FIELDS.map((name) => `{{${name}}}`).join(" and ")}.`
						: `"{{${field}}}" cannot be filled in here: merge fields work only in the questions of a repeat section's block.`,
				});
			}
		}

		if (question.type === "multiple_choice" && question.max !== undefined) {
			if (question.max > question.options.length) {
				problems.push({
					where,
					message: `"max" is ${question.max}, but there are only ${question.options.length} options.`,
				});
			}
		}
		if (question.type === "number" && question.min !== undefined && question.max !== undefined) {
			if (question.min > question.max) {
				problems.push({
					where,
					message: `"min" (${question.min}) is above "max" (${question.max}).`,
				});
			}
		}
		if (question.type === "ranking" && question.options.some((option) => option.specify)) {
			problems.push({
				where,
				message: 'An option of a ranking cannot ask for text. Remove "specify".',
			});
		}

		if (inBlock && question.detached) {
			problems.push({
				where,
				message:
					"A block's question cannot be detached: it is asked for each item, and a detached answer is asked once, at the end.",
			});
		}
		if (place.part === "status" && question.type !== "single_choice") {
			problems.push({
				where,
				message: `A status question is answered with one tap on a card, so it has to be a single choice; this one is a ${typeName(question)}. Move it to "followUps" or change its type.`,
			});
		}

		if (question.showIf) {
			const self = places.questions.get(question.id);
			for (const leaf of leafConditions(question.showIf)) {
				const problem = ruleProblem(leaf, question, place.section, self?.order ?? 0);
				if (problem) problems.push({ where: `${where} › showIf`, message: problem });
			}
		}
	};

	/** What is wrong with one condition of a question's rule, if anything. */
	const ruleProblem = (
		leaf: Extract<Condition, { question: string }>,
		source: Question,
		section: Section,
		order: number,
	): string | undefined => {
		const target = places.questions.get(leaf.question);
		const name = `"${leaf.question}"`;
		if (!target) return `The rule points at ${name}, which is not a question in this form.`;
		if (target.question.id === source.id) return "The rule points at its own question.";
		if (target.order > order) {
			return `The rule points at ${name}, which comes later in the form. A rule can only look at earlier answers: move this question after it, or change the rule.`;
		}
		if (target.part !== undefined && target.section.id !== section.id) {
			return `The rule points at ${name}, a question asked for each item of the repeat section "${target.section.id}". From outside that section there is no telling which item's answer is meant.`;
		}
		if (target.question.detached && !source.detached) {
			return `The rule points at ${name}, whose answer is detached: it is stored apart from the response, so nothing in the response can depend on it. Detach this question too, or change the rule.`;
		}
		if (source.detached && !target.question.detached) {
			return `This question is detached, so it is asked after the response is complete and stored apart from it. Its rule can only look at other detached questions, and ${name} is not one.`;
		}
		return operandProblem(leaf, target.question);
	};

	for (const section of definition.sections) {
		const at = sectionAt(section);
		if (section.type === "questions") {
			section.questions.forEach((question, index) => {
				visit(question, `${at} › questions[${index}] "${question.id}"`, { question, section });
			});
			continue;
		}
		for (const group of section.groups) {
			groupIds.push(group.id);
			for (const item of group.items) itemIds.push(item.id);
		}
		section.block.status.forEach((question, index) => {
			const where = `${at} › block › status[${index}] "${question.id}"`;
			visit(question, where, { question, section, part: "status" });
		});
		section.block.followUps.forEach((question, index) => {
			const where = `${at} › block › followUps[${index}] "${question.id}"`;
			visit(question, where, { question, section, part: "followUps" });
		});
		if (section.block.followUpsIntro !== undefined) {
			for (const field of mergeFields(section.block.followUpsIntro)) {
				if (field === COUNT_FIELD) continue;
				problems.push({
					where: `${at} › block › followUpsIntro`,
					message: `"{{${field}}}" is not a merge field here. The introduction can use {{${COUNT_FIELD}}}, the number of items with follow-ups.`,
				});
			}
		}
	}

	const duplicates: Array<[string, string[]]> = [
		["group", groupIds],
		["item", itemIds],
		["question", questionIds],
	];
	for (const [kind, ids] of duplicates) {
		for (const id of repeated(ids)) {
			problems.push({
				where: "the form",
				message: `The ${kind} id "${id}" is used more than once. Answers are stored under these ids, so each ${kind} in the form needs its own.`,
			});
		}
	}

	// An item's questions are exported as `<item>.<question>` and a question's options as
	// `<question>.<option>`, so an id that is both an item's and a question's could name two
	// columns the same.
	const items = new Set(itemIds);
	for (const id of new Set(questionIds)) {
		if (!items.has(id)) continue;
		problems.push({
			where: "the form",
			message: `"${id}" is the id of an item and of a question. In the export of responses the two could name the same column: give one of them another id.`,
		});
	}

	return problems;
}

/** Whether a condition asks something its question's kind of answer can tell. */
function operandProblem(
	leaf: Extract<Condition, { question: string }>,
	target: Question,
): string | undefined {
	const name = `"${target.id}"`;
	const kind = typeName(target);
	if ("answered" in leaf) return undefined;

	if ("includes" in leaf) {
		if (target.type !== "multiple_choice" && target.type !== "ranking") {
			return `"includes" is for a multiple choice or a ranking, and ${name} is a ${kind}. Use "is".`;
		}
		return unknownOption(leaf.includes, target.options, name);
	}

	const value = "is" in leaf ? leaf.is : leaf.isNot;
	const operator = "is" in leaf ? "is" : "isNot";
	const usesRows = target.type === "grid" || target.type === "fields";
	if (leaf.row !== undefined && !usesRows) {
		return `"row" is for a grid or a question with fields, and ${name} is a ${kind}.`;
	}
	switch (target.type) {
		case "single_choice":
		case "dropdown":
			return unknownOption(value, target.options, name);
		case "multiple_choice":
		case "ranking":
			return `${name} is a ${kind}, where several options can be chosen. Use "includes" instead of "${operator}".`;
		case "grid": {
			if (leaf.row === undefined) {
				return `${name} is a grid, so the rule has to name a row: { question, row, ${operator} }. Its rows are ${list(target.rows)}.`;
			}
			if (!target.rows.some((row) => row.id === leaf.row)) {
				return `${name} has no row "${leaf.row}". Its rows are ${list(target.rows)}.`;
			}
			return unknownOption(value, target.columns, name, "column");
		}
		case "fields": {
			if (leaf.row === undefined) {
				return `${name} has several fields, so the rule has to name one in "row". Its fields are ${list(target.fields)}.`;
			}
			if (!target.fields.some((field) => field.id === leaf.row)) {
				return `${name} has no field "${leaf.row}". Its fields are ${list(target.fields)}.`;
			}
			return typeof value === "string" ? undefined : `A field holds text, so compare it with text.`;
		}
		case "number":
			return typeof value === "number"
				? undefined
				: `${name} is a number, so compare it with a number, not "${value}".`;
		default:
			return typeof value === "string"
				? undefined
				: `${name} holds text, so compare it with text, not the number ${value}.`;
	}
}

function list(entries: Array<{ id: string }>): string {
	return entries.map((entry) => `"${entry.id}"`).join(", ");
}

function unknownOption(
	value: string | number,
	options: Array<{ id: string }>,
	name: string,
	kind = "option",
): string | undefined {
	if (options.some((option) => option.id === value)) return undefined;
	return `${name} has no ${kind} "${value}". Its ${kind}s are ${list(options)}.`;
}
