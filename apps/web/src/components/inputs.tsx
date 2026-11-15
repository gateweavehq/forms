import { type Item, mergeItem, type Option, type Question } from "@gateweave/forms-schema";
import { useId, useRef } from "react";
import { cn } from "#/lib/cn";
import type { Draft } from "#/lib/draft";
import { strings } from "#/lib/strings";
import { Button } from "./button";

export interface QuestionInputProps {
	question: Question;
	/** For a block's question: the item whose name its options may carry. */
	item?: Item | undefined;
	draft: Draft;
	onDraft: (draft: Draft) => void;
	/**
	 * Called when an answer was picked by a tap or a click, the two ways that may move a card on.
	 * Arrow keys only move the selection: a keyboard user confirms with Enter.
	 */
	onPicked?: ((draft: Draft) => void) | undefined;
	/** The id of the element that asks the question. */
	labelledBy: string;
	/** The id of the element that says what is wrong with the answer, when something is. */
	problemId?: string | undefined;
	/** Shows which number key picks each option. Only where there is a keyboard to use. */
	keyHints?: boolean | undefined;
}

const box =
	"relative flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-4 py-2.5 text-left text-base leading-snug transition-colors hover:bg-accent has-checked:border-foreground has-checked:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring motion-reduce:transition-none";

const field =
	"min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground aria-invalid:border-destructive";

/** The round or square mark beside an option, filled when its hidden input is checked. */
function Mark({ shape }: { shape: "radio" | "checkbox" }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-5 shrink-0 place-items-center border border-muted-foreground peer-checked:border-foreground peer-checked:bg-foreground peer-checked:*:opacity-100",
				shape === "radio" ? "rounded-full" : "rounded-sm",
			)}
		>
			<span
				className={cn(
					"opacity-0",
					shape === "radio"
						? "size-2 rounded-full bg-background"
						: "text-xs leading-none font-bold text-background",
				)}
			>
				{shape === "checkbox" ? "✓" : ""}
			</span>
		</span>
	);
}

/** The line of text an option asks for, shown once the option is chosen. */
function Specify({
	option,
	label,
	draft,
	onDraft,
}: {
	option: Option;
	label: string;
	draft: Draft;
	onDraft: (draft: Draft) => void;
}) {
	return (
		<input
			type="text"
			className={cn(field, "mt-2")}
			aria-label={`${label}: ${strings.input.specify}`}
			placeholder={strings.input.specify}
			value={draft.texts[option.id] ?? ""}
			onChange={(event) =>
				onDraft({ ...draft, texts: { ...draft.texts, [option.id]: event.target.value } })
			}
		/>
	);
}

function RadioList({
	question,
	item,
	draft,
	onDraft,
	onPicked,
	labelledBy,
	problemId,
	keyHints,
}: QuestionInputProps & { question: Extract<Question, { options: Option[] }> }) {
	const name = useId();
	/**
	 * Whether the change being handled came from a pointer. A radio also changes when an arrow
	 * key moves through the group, and that must select without moving the card on.
	 */
	const viaPointer = useRef(false);
	const pick = (option: Option) => {
		const next = { ...draft, option: option.id };
		onDraft(next);
		if (viaPointer.current) onPicked?.(next);
		viaPointer.current = false;
	};
	return (
		<div
			role="radiogroup"
			aria-labelledby={labelledBy}
			aria-describedby={problemId}
			className="flex flex-col gap-2"
			// A press that began on an answer and was let go elsewhere changes nothing, and
			// leaves the mark that a pointer was at work. The next change by keyboard would then
			// pass for a tap and move the card on. A key pressed here means the keyboard is in use.
			onKeyDown={() => {
				viaPointer.current = false;
			}}
		>
			{question.options.map((option, index) => {
				const label = item ? mergeItem(option.label, item) : option.label;
				const checked = draft.option === option.id;
				return (
					<div key={option.id}>
						<label
							className={box}
							onPointerDown={() => {
								viaPointer.current = true;
							}}
						>
							<input
								type="radio"
								className="peer sr-only"
								name={name}
								value={option.id}
								checked={checked}
								onChange={() => pick(option)}
								// A tap on the answer already chosen changes nothing, and still means "this
								// one": going back to a card and tapping its answer again moves on.
								onClick={() => {
									if (checked) pick(option);
								}}
							/>
							<Mark shape="radio" />
							<span className="min-w-0 flex-1 break-words">{label}</span>
							{keyHints && index < 9 && (
								// Hidden from screen readers: read after every option, "1", "2", "3" is noise,
								// and the card says once which keys there are.
								<span
									aria-hidden="true"
									className="hidden size-6 shrink-0 items-center justify-center rounded border border-input text-xs text-muted-foreground pointer-fine:inline-flex"
								>
									{index + 1}
								</span>
							)}
						</label>
						{option.specify && checked && (
							<Specify option={option} label={label} draft={draft} onDraft={onDraft} />
						)}
					</div>
				);
			})}
			{/*
			 * A radio button, once chosen, can only be swapped for another. Someone who tapped by
			 * mistake, or decides not to say, needs a way back to no answer: every question can
			 * be passed, and that has to stay true after a tap.
			 */}
			{draft.option !== "" && (
				<Button
					variant="ghost"
					className="self-start"
					onClick={() => onDraft({ ...draft, option: "" })}
				>
					{strings.input.clear}
				</Button>
			)}
		</div>
	);
}

function CheckboxList({
	question,
	item,
	draft,
	onDraft,
	labelledBy,
	problemId,
}: QuestionInputProps & { question: Extract<Question, { type: "multiple_choice" }> }) {
	const hintId = useId();
	const { max } = question;
	const full = max !== undefined && draft.options.length >= max;
	const toggle = (id: string) => {
		const chosen = draft.options.includes(id);
		if (!chosen && full) return;
		const options = chosen ? draft.options.filter((other) => other !== id) : [...draft.options, id];
		onDraft({ ...draft, options });
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset's legend would repeat the heading that already asks the question
		<div
			role="group"
			aria-labelledby={labelledBy}
			aria-describedby={cn(max !== undefined && hintId, problemId) || undefined}
			className="flex flex-col gap-2"
		>
			{max !== undefined && (
				<p id={hintId} aria-live="polite" className="text-sm text-muted-foreground">
					{full ? strings.input.limitReached(max) : strings.input.upTo(max)}
				</p>
			)}
			{question.options.map((option) => {
				const label = item ? mergeItem(option.label, item) : option.label;
				const checked = draft.options.includes(option.id);
				const blocked = full && !checked;
				return (
					<div key={option.id}>
						<label className={cn(box, blocked && "cursor-not-allowed opacity-60 hover:bg-card")}>
							<input
								type="checkbox"
								className="peer sr-only"
								checked={checked}
								// Not `disabled`: a disabled box cannot be focused, so a keyboard would skip
								// it without ever hearing why.
								aria-disabled={blocked || undefined}
								onChange={() => toggle(option.id)}
							/>
							<Mark shape="checkbox" />
							<span className="min-w-0 flex-1 break-words">{label}</span>
						</label>
						{option.specify && checked && (
							<Specify option={option} label={label} draft={draft} onDraft={onDraft} />
						)}
					</div>
				);
			})}
		</div>
	);
}

function Dropdown({
	question,
	draft,
	onDraft,
	labelledBy,
	problemId,
}: QuestionInputProps & { question: Extract<Question, { type: "dropdown" }> }) {
	const chosen = question.options.find((option) => option.id === draft.option);
	return (
		<div>
			<select
				className={field}
				aria-labelledby={labelledBy}
				aria-describedby={problemId}
				value={draft.option}
				onChange={(event) => onDraft({ ...draft, option: event.target.value })}
			>
				<option value="">{strings.input.choose}</option>
				{question.options.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
			{chosen?.specify && (
				<Specify option={chosen} label={chosen.label} draft={draft} onDraft={onDraft} />
			)}
		</div>
	);
}

/**
 * A ranking by picking in order, not by dragging: a drag has no keyboard form, is hard on a
 * phone, and in the one study that tested it people skipped more and took longer.
 */
function Ranking({
	question,
	draft,
	onDraft,
	labelledBy,
}: QuestionInputProps & { question: Extract<Question, { type: "ranking" }> }) {
	const hintId = useId();
	const toggle = (id: string) => {
		const ranked = draft.options.includes(id);
		const options = ranked ? draft.options.filter((other) => other !== id) : [...draft.options, id];
		onDraft({ ...draft, options });
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset's legend would repeat the heading that already asks the question
		<div
			role="group"
			aria-labelledby={labelledBy}
			aria-describedby={hintId}
			className="flex flex-col gap-2"
		>
			<p id={hintId} className="text-sm text-muted-foreground">
				{strings.input.rankHint}
			</p>
			{question.options.map((option) => {
				const rank = draft.options.indexOf(option.id) + 1;
				return (
					<button
						key={option.id}
						type="button"
						aria-pressed={rank > 0}
						// The number in the circle means nothing read aloud after the label. This says
						// the same in words, and starts with the label a sighted person sees.
						aria-label={`${option.label}, ${rank > 0 ? strings.input.ranked(rank) : strings.input.notRanked}`}
						className={cn(box, rank > 0 && "border-foreground bg-accent")}
						onClick={() => toggle(option.id)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"grid size-6 shrink-0 place-items-center rounded-full border text-sm font-semibold",
								rank > 0
									? "border-foreground bg-foreground text-background"
									: "border-muted-foreground",
							)}
						>
							{rank > 0 ? rank : ""}
						</span>
						<span className="min-w-0 flex-1 break-words">{option.label}</span>
					</button>
				);
			})}
			{draft.options.length > 0 && (
				<Button
					variant="ghost"
					className="self-start"
					onClick={() => onDraft({ ...draft, options: [] })}
				>
					{strings.input.clearRanking}
				</Button>
			)}
		</div>
	);
}

/**
 * A grid as one small question per row. A table of radio buttons does not fit a phone, and on
 * every screen people skip fewer rows and straight-line less when rows are asked one by one.
 */
function Grid({
	question,
	draft,
	onDraft,
}: QuestionInputProps & { question: Extract<Question, { type: "grid" }> }) {
	const name = useId();
	return (
		<div className="flex flex-col gap-5">
			{question.rows.map((row) => (
				<fieldset key={row.id} className="flex min-w-0 flex-col gap-2">
					<legend className="mb-2 flex min-h-11 w-full items-center justify-between gap-3 text-base font-medium">
						{row.label}
						{draft.rows[row.id] !== undefined && (
							<Button
								variant="ghost"
								className="-mr-4 text-sm font-normal"
								aria-label={strings.input.clearRow(row.label)}
								onClick={() => {
									const { [row.id]: _cleared, ...rows } = draft.rows;
									onDraft({ ...draft, rows });
								}}
							>
								{strings.input.clearRowShort}
							</Button>
						)}
					</legend>
					{/* Stacked on a phone, where three answers side by side would break their words. */}
					<div className="flex flex-col gap-2 sm:flex-row">
						{question.columns.map((column) => (
							<label key={column.id} className={cn(box, "sm:flex-1")}>
								<input
									type="radio"
									className="peer sr-only"
									name={`${name}-${row.id}`}
									value={column.id}
									checked={draft.rows[row.id] === column.id}
									onChange={() =>
										onDraft({ ...draft, rows: { ...draft.rows, [row.id]: column.id } })
									}
								/>
								<Mark shape="radio" />
								<span className="min-w-0 flex-1 break-words">{column.label}</span>
							</label>
						))}
					</div>
				</fieldset>
			))}
		</div>
	);
}

function Fields({
	question,
	draft,
	onDraft,
}: QuestionInputProps & { question: Extract<Question, { type: "fields" }> }) {
	const id = useId();
	return (
		<div className="flex flex-col gap-4">
			{question.fields.map((entry) => (
				<div key={entry.id} className="flex flex-col gap-1.5">
					<label htmlFor={`${id}-${entry.id}`} className="text-base font-medium">
						{entry.label}
					</label>
					<input
						id={`${id}-${entry.id}`}
						type="text"
						className={field}
						placeholder={entry.placeholder}
						value={draft.rows[entry.id] ?? ""}
						onChange={(event) =>
							onDraft({ ...draft, rows: { ...draft.rows, [entry.id]: event.target.value } })
						}
					/>
				</div>
			))}
		</div>
	);
}

/** The input for a question of any type, showing a draft and reporting every change to it. */
export function QuestionInput(props: QuestionInputProps) {
	const { question, draft, onDraft, labelledBy, problemId } = props;
	const text = {
		className: field,
		"aria-labelledby": labelledBy,
		"aria-describedby": problemId,
		"aria-invalid": problemId ? true : undefined,
		value: draft.text,
	};
	switch (question.type) {
		case "short_text":
			return (
				<input
					type="text"
					{...text}
					placeholder={question.placeholder}
					onChange={(event) => onDraft({ ...draft, text: event.target.value })}
				/>
			);
		case "long_text":
			return (
				<textarea
					{...text}
					rows={5}
					placeholder={question.placeholder}
					onChange={(event) => onDraft({ ...draft, text: event.target.value })}
				/>
			);
		case "email":
			return (
				<input
					type="email"
					autoComplete="email"
					{...text}
					placeholder={question.placeholder}
					onChange={(event) => onDraft({ ...draft, text: event.target.value })}
				/>
			);
		case "number":
			return (
				// Not `type="number"`: it drops what it cannot parse without saying so, scrolls its
				// value under a mouse wheel, and refuses the decimal comma half of Europe types.
				<input
					type="text"
					inputMode="decimal"
					{...text}
					placeholder={question.placeholder}
					onChange={(event) => onDraft({ ...draft, text: event.target.value })}
				/>
			);
		case "single_choice":
			return <RadioList {...props} question={question} />;
		case "multiple_choice":
			return <CheckboxList {...props} question={question} />;
		case "dropdown":
			return <Dropdown {...props} question={question} />;
		case "ranking":
			return <Ranking {...props} question={question} />;
		case "grid":
			return <Grid {...props} question={question} />;
		case "fields":
			return <Fields {...props} question={question} />;
	}
}
