import type { Condition, DefinitionInput, Paragraph, RichText } from "@gateweave/forms-schema";
import { type FoldedRun, NAME } from "./fold";
import { Ids } from "./ids";
import type { RawCondition, RawQuestion } from "./read";

type SectionInput = DefinitionInput["sections"][number];
type QuestionInput = Extract<SectionInput, { type: "questions" }>["questions"][number];

/** A page's questions as they will become a `questions` section. */
export interface QuestionsDraft {
	type: "questions";
	/** The page it came from, from 1. */
	page: number;
	title: string;
	text: Paragraph[];
	questions: RawQuestion[];
}

/** A run of folded pages as it will become a `repeat` section. */
export interface RepeatDraft {
	type: "repeat";
	title: string;
	text: Paragraph[];
	run: FoldedRun;
}

export type Draft = QuestionsDraft | RepeatDraft;

/** The ids a question and its parts were given. */
interface Named {
	id: string;
	options: string[];
	rows: string[];
	columns: string[];
	fields: string[];
}

function rich(paragraphs: Paragraph[]): RichText | undefined {
	return paragraphs.length > 0 ? paragraphs : undefined;
}

/**
 * Turns drafts into sections: gives everything an id and rewrites each rule from pointing at a
 * question and an option to naming their ids.
 */
export class Emitter {
	readonly #sections = new Ids();
	readonly #groups = new Ids();
	readonly #items = new Ids();
	readonly #questions = new Ids();
	readonly #named = new Map<RawQuestion, Named>();
	readonly notes = new Set<string>();

	/** Names every question first, so that a rule can name a question wherever it stands. */
	name(drafts: Draft[]): void {
		for (const draft of drafts) {
			const questions = draft.type === "questions" ? draft.questions : draft.run.questions;
			for (const question of questions) {
				const scope = (labels: Array<{ label: string }>, kind: string) => {
					const ids = new Ids();
					return labels.map((entry, index) => ids.take(entry.label, `${kind}-${index + 1}`));
				};
				this.#named.set(question, {
					id: this.#questions.take(question.title.replaceAll(NAME, ""), "question"),
					options: scope(question.options, "option"),
					rows: scope(question.rows, "row"),
					columns: scope(question.columns, "column"),
					fields: scope(question.fields, "field"),
				});
			}
		}
	}

	#condition(condition: RawCondition): Condition {
		if (condition.op === "all")
			return { all: condition.parts.map((part) => this.#condition(part)) };
		if (condition.op === "any")
			return { any: condition.parts.map((part) => this.#condition(part)) };
		if (condition.op === "not") return { not: this.#condition(condition.part) };
		const named = this.#named.get(condition.question);
		if (!named) throw new Error("A rule points at a question that was not imported");
		const question = named.id;
		if (condition.op === "answered") return { question, answered: condition.answered };
		if (condition.op === "includes") {
			return { question, includes: named.options[condition.option] ?? "" };
		}
		const isGrid = condition.question.type === "grid";
		const rows = isGrid ? named.rows : named.fields;
		const row = condition.row === undefined ? {} : { row: rows[condition.row] ?? "" };
		const choices = isGrid ? named.columns : named.options;
		const to = condition.option === undefined ? condition.value : choices[condition.option];
		const value = to ?? "";
		return condition.op === "is"
			? { question, ...row, is: value }
			: { question, ...row, isNot: value };
	}

	/** The rule of something shown by several of Tally's rules: any one of them is enough. */
	#showIf(shownBy: RawCondition[]): Condition | undefined {
		const conditions = new Map<string, Condition>();
		for (const raw of shownBy) {
			const condition = this.#condition(raw);
			conditions.set(JSON.stringify(condition), condition);
		}
		const [first, ...more] = [...conditions.values()];
		if (!first) return undefined;
		return more.length === 0 ? first : { any: [first, ...more] };
	}

	#question(raw: RawQuestion, wording: (text: string) => string): QuestionInput {
		const named = this.#named.get(raw);
		if (!named) throw new Error("A question was not named before it was written");
		if (!raw.title)
			this.notes.add('A question without a title was given the title "Untitled question".');
		const showIf = this.#showIf(raw.shownBy);
		const reworded = (paragraphs: Paragraph[]) =>
			paragraphs.map((paragraph) =>
				typeof paragraph === "string"
					? wording(paragraph)
					: paragraph.map((span) => ({ ...span, text: wording(span.text) })),
			);
		const description = rich(reworded(raw.description));
		const detail = rich(reworded(raw.detail));
		const base = {
			id: named.id,
			label: wording(raw.title) || "Untitled question",
			...(description ? { description } : {}),
			...(detail ? { detail } : {}),
			...(raw.required ? { required: true } : {}),
			...(showIf ? { showIf } : {}),
		};
		const placeholder = raw.placeholder ? { placeholder: raw.placeholder } : {};
		const options = raw.options.map((option, index) => ({
			id: named.options[index] ?? "",
			label: wording(option.label) || `Option ${index + 1}`,
			...(option.specify ? { specify: true } : {}),
		}));

		switch (raw.type) {
			case "short_text":
			case "long_text":
			case "email":
				return { ...base, type: raw.type, ...placeholder };
			case "number":
				return {
					...base,
					type: "number",
					...placeholder,
					...(raw.numberMin === undefined ? {} : { min: raw.numberMin }),
					...(raw.numberMax === undefined ? {} : { max: raw.numberMax }),
				};
			case "single_choice":
			case "dropdown":
			case "ranking":
				return { ...base, type: raw.type, options };
			case "multiple_choice":
				return {
					...base,
					type: "multiple_choice",
					options,
					...(raw.max === undefined ? {} : { max: raw.max }),
				};
			case "grid":
				return {
					...base,
					type: "grid",
					rows: raw.rows.map((row, index) => ({
						id: named.rows[index] ?? "",
						label: wording(row.label) || `Row ${index + 1}`,
					})),
					columns: raw.columns.map((column, index) => ({
						id: named.columns[index] ?? "",
						label: wording(column.label) || `Column ${index + 1}`,
					})),
				};
			case "fields":
				return {
					...base,
					type: "fields",
					fields: raw.fields.map((field, index) => ({
						id: named.fields[index] ?? "",
						label: wording(field.label) || `Field ${index + 1}`,
						...(field.placeholder ? { placeholder: field.placeholder } : {}),
					})),
				};
		}
	}

	section(draft: Draft): SectionInput {
		const text = rich(draft.text);
		const base = {
			id: this.#sections.take(draft.title, "section"),
			title: draft.title,
			...(text ? { text } : {}),
		};
		if (draft.type === "questions") {
			return {
				...base,
				type: "questions",
				questions: draft.questions.map((question) => this.#question(question, (text) => text)),
			};
		}
		const { run } = draft;
		// The label stands in for the name, so the shorter field is enough when they never differ.
		const field = run.named ? "{{item.name}}" : "{{item.label}}";
		const wording = (text: string) => text.replaceAll(NAME, field);
		const status = run.questions.filter((question) => question.shownBy.length === 0);
		const followUps = run.questions.filter((question) => question.shownBy.length > 0);
		return {
			...base,
			type: "repeat",
			groups: run.groups.map((group, index) => {
				const title = group.title ?? `Group ${index + 1}`;
				return {
					id: this.#groups.take(title, "group"),
					title,
					items: group.items.map((item) => {
						const detail = rich(item.detail);
						return {
							id: this.#items.take(item.label, "item"),
							label: item.label,
							...(item.name ? { name: item.name } : {}),
							...(item.definition ? { definition: item.definition } : {}),
							...(detail ? { detail } : {}),
						};
					}),
				};
			}),
			block: {
				status: status.map((question) => this.#question(question, wording)),
				followUps: followUps.map((question) => this.#question(question, wording)),
			},
		};
	}
}
