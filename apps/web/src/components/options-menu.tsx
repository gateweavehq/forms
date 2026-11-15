import { useEffect, useId, useRef, useState } from "react";
import { cn } from "#/lib/cn";
import { strings } from "#/lib/strings";
import { ContinueElsewhere, type ElsewhereHandle } from "./continue-elsewhere";
import { YourAnswers, type YourAnswersHandle } from "./your-answers";

const row =
	"flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent";

/**
 * The few things a person may want to set while answering, behind one button in the header, so
 * that they are not on every card: whether cards move on by themselves, the address that
 * continues on another device, and what they can do about their own answers (keep the consent
 * they gave, make this browser forget the way back, take everything back).
 *
 * It is a button that shows a small panel, not an ARIA menu: what is in it is a checkbox and a
 * button, and those keep their own roles and keys. Escape, a press outside it, and the focus
 * leaving it all close it.
 */
export function OptionsMenu({
	autoAdvance,
	formId,
	responseId,
	secret,
	version,
	hasConsent,
	onWithdrawn,
}: {
	/** The switch for moving on by itself. Absent in a form that has no cards that do. */
	autoAdvance: { on: boolean; set: (on: boolean) => void } | undefined;
	formId: string;
	responseId: string;
	secret: string;
	/** Names the wording the response began under, for the copy of its consent. */
	version: string;
	hasConsent: boolean;
	onWithdrawn: () => void;
}) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const elsewhere = useRef<ElsewhereHandle>(null);
	const yours = useRef<YourAnswersHandle>(null);
	const panelId = useId();

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			button.current?.focus();
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: it only watches the focus leave its children, and is not itself a control
		<div
			ref={root}
			className="relative shrink-0"
			onBlur={(event) => {
				// The focus went somewhere outside: a keyboard has left the panel behind.
				if (event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget)) {
					setOpen(false);
				}
			}}
		>
			<button
				ref={button}
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				className="-mr-2 inline-flex min-h-11 cursor-pointer touch-manipulation items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
				onClick={() => setOpen((was) => !was)}
			>
				{strings.options.open}
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.75"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
					className={cn("size-3.5", open && "rotate-180")}
				>
					<path d="M4 6l4 4 4-4" />
				</svg>
			</button>
			<div
				id={panelId}
				hidden={!open}
				className="absolute top-full right-0 z-20 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-xl border bg-card p-1.5 text-card-foreground shadow-lg"
			>
				{autoAdvance && (
					<label className={row}>
						<input
							type="checkbox"
							className="size-5 shrink-0 accent-brand"
							checked={autoAdvance.on}
							onChange={(event) => autoAdvance.set(event.target.checked)}
						/>
						{strings.card.autoAdvance}
					</label>
				)}
				<button
					type="button"
					className={row}
					onClick={() => {
						setOpen(false);
						elsewhere.current?.open();
					}}
				>
					{strings.elsewhere.open}
				</button>
				<button
					type="button"
					className={row}
					onClick={() => {
						setOpen(false);
						yours.current?.open();
					}}
				>
					{strings.yours.open}
				</button>
			</div>
			{/* Outside the panel: the panel is hidden while the dialog it opened is up. */}
			<ContinueElsewhere
				ref={elsewhere}
				formId={formId}
				responseId={responseId}
				secret={secret}
				onClose={() => button.current?.focus()}
			/>
			<YourAnswers
				ref={yours}
				formId={formId}
				responseId={responseId}
				secret={secret}
				version={version}
				hasConsent={hasConsent}
				onWithdrawn={onWithdrawn}
				onClose={() => button.current?.focus()}
			/>
		</div>
	);
}
