/**
 * Builds page data in the shape Tally's form pages carry, so the tests can write a made-up form
 * the way Tally would hold it: a flat list of blocks, a question being a TITLE followed by the
 * blocks of its input, and rules that name blocks by uuid.
 */

export interface Block {
	uuid: string;
	type: string;
	groupUuid: string;
	groupType: string;
	payload: Record<string, unknown>;
}

interface Flags {
	hidden?: boolean;
	required?: boolean;
	/**
	 * The uuid a rule names the block or its group by. A rule stands before the blocks it shows,
	 * so their uuids are made first (`uuid()`) and passed here.
	 */
	as?: string;
}

/** Tally's formatted text: nested `[content, attributes]` pairs. */
export type Schema = unknown[];

export const bold = (text: string): unknown => [
	text,
	[
		["tag", "span"],
		["font-weight", "bold"],
	],
];
export const link = (text: string, href: string): unknown => [text, [["href", href]]];
export const paragraph = (...parts: unknown[]): unknown => [parts, [["tag", "p"]]];

export interface Choices {
	group: string;
	options: string[];
}

export interface Matrix {
	group: string;
	rows: string[];
	columns: string[];
}

export interface Condition {
	field: string;
	comparison: string;
	value?: string;
}

export class TallyBuilder {
	readonly blocks: Block[] = [];
	#count = 0;
	#pages = 0;

	uuid(): string {
		this.#count++;
		return `00000000-0000-4000-8000-${String(this.#count).padStart(12, "0")}`;
	}

	#add(type: string, groupType: string, payload: Record<string, unknown>, group?: string): Block {
		const block = { uuid: this.uuid(), type, groupUuid: group ?? this.uuid(), groupType, payload };
		this.blocks.push(block);
		return block;
	}

	#hidden(flags: Flags): Record<string, unknown> {
		return flags.hidden ? { isHidden: true } : {};
	}

	formTitle(title: string): void {
		this.#add("FORM_TITLE", "TEXT", { safeHTMLSchema: [[title]], title });
	}

	/** A text block. A plain string is one unformatted run. Rules name it by its own uuid. */
	text(content: string | Schema, flags: Flags = {}): string {
		const safeHTMLSchema = typeof content === "string" ? [[content]] : content;
		const block = this.#add("TEXT", "TEXT", { ...this.#hidden(flags), safeHTMLSchema });
		if (flags.as) block.uuid = flags.as;
		return block.uuid;
	}

	/** The empty text blocks Tally leaves between things. */
	blank(): void {
		this.#add("TEXT", "TEXT", { safeHTMLSchema: [] });
	}

	heading(level: 1 | 2 | 3, text: string): void {
		this.#add(`HEADING_${level}`, `HEADING_${level}`, { safeHTMLSchema: [[text]] });
	}

	title(text: string, flags: Flags = {}): void {
		this.#add("TITLE", "QUESTION", { ...this.#hidden(flags), safeHTMLSchema: [[text]] });
	}

	divider(): void {
		this.#add("DIVIDER", "DIVIDER", {});
	}

	pageBreak(name?: string, thankYou = false): void {
		this.#add("PAGE_BREAK", "PAGE_BREAK", {
			index: this.#pages++,
			...(name ? { name } : {}),
			isThankYouPage: thankYou,
		});
	}

	/** A text, long text, number or email input. Rules name it by its group. */
	input(
		type: "INPUT_TEXT" | "TEXTAREA" | "INPUT_NUMBER" | "INPUT_EMAIL",
		placeholder = "",
		flags: Flags = {},
	): string {
		const payload = { isRequired: flags.required ?? false, placeholder, ...this.#hidden(flags) };
		return this.#add(type, type, payload, flags.as).groupUuid;
	}

	#options(
		type: string,
		groupType: string,
		labels: string[],
		flags: Flags & { other?: boolean; extra?: Record<string, unknown> },
	): Choices {
		const group = flags.as ?? this.uuid();
		const options = labels.map((text, index) => {
			const isOther = flags.other === true && index === labels.length - 1;
			const payload = {
				index,
				isRequired: flags.required ?? false,
				isFirst: index === 0,
				isLast: index === labels.length - 1,
				text,
				...(flags.other ? { hasOtherOption: true } : {}),
				...(isOther ? { isOtherOption: true } : {}),
				...this.#hidden(flags),
				...flags.extra,
			};
			return this.#add(type, groupType, payload, group).uuid;
		});
		return { group, options };
	}

	multipleChoice(labels: string[], flags: Flags & { other?: boolean } = {}): Choices {
		return this.#options("MULTIPLE_CHOICE_OPTION", "MULTIPLE_CHOICE", labels, flags);
	}

	checkboxes(labels: string[], flags: Flags & { other?: boolean; max?: number } = {}): Choices {
		const extra = flags.max ? { hasMaxChoices: true, maxChoices: flags.max } : {};
		return this.#options("CHECKBOX", "CHECKBOXES", labels, { ...flags, extra });
	}

	dropdown(labels: string[]): Choices {
		return this.#options("DROPDOWN_OPTION", "DROPDOWN", labels, {});
	}

	ranking(labels: string[]): Choices {
		return this.#options("RANKING_OPTION", "RANKING", labels, {});
	}

	matrix(columns: string[], rows: string[], flags: Flags = {}): Matrix {
		const group = flags.as ?? this.uuid();
		const payload = { isRequired: flags.required ?? false, ...this.#hidden(flags) };
		this.#add("MATRIX", "MATRIX", payload, group);
		const add = (type: string, text: string, index: number) =>
			this.#add(type, "MATRIX", { ...payload, index, safeHTMLSchema: [[text]] }, group).uuid;
		return {
			group,
			columns: columns.map((text, index) => add("MATRIX_COLUMN", text, index)),
			rows: rows.map((text, index) => add("MATRIX_ROW", text, index)),
		};
	}

	/** A rule: when the fields compare so, show these blocks. */
	logic(conditions: Condition[], show: string[], operator: "AND" | "OR" = "AND"): Block {
		return this.#add("CONDITIONAL_LOGIC", "CONDITIONAL_LOGIC", {
			logicalOperator: operator,
			conditionals: conditions.map(({ field, comparison, value }) => ({
				uuid: this.uuid(),
				type: "SINGLE",
				payload: {
					// Tally keeps an old wording of the field's title here. Nothing may depend on it.
					field: { uuid: field, type: "INPUT_FIELD", title: "An earlier wording" },
					comparison,
					value: value ?? "",
				},
			})),
			actions: [{ uuid: this.uuid(), type: "SHOW_BLOCKS", payload: { showBlocks: show } }],
		});
	}

	/** A block of a type the builder has no method for. */
	other(type: string, payload: Record<string, unknown> = {}): Block {
		return this.#add(type, type, payload);
	}

	/** The page data as a Tally page's `__NEXT_DATA__` holds it. */
	pageData(name = "Untitled"): unknown {
		return { props: { pageProps: { name, blocks: this.blocks, settings: { language: "en" } } } };
	}
}
