import { type ReactNode, useId, useRef, useState } from "react";
import { strings } from "#/lib/strings";
import { Button } from "../button";
import { LiveButton } from "../live-button";
import { refusalText } from "./bring-in";

/**
 * A button that asks before it acts. The dialog says what will be removed, in numbers, and the
 * button that goes ahead repeats what it does: nobody should delete a study's answers by
 * pressing "OK".
 *
 * With `typed`, the person also has to type something that names what they are deleting, and
 * the button waits for it. What they typed is handed on, so that the server can ask the same.
 */
export function ConfirmButton({
	label,
	title,
	children,
	confirmLabel,
	onConfirm,
	typed,
	variant = "outline",
}: {
	label: string;
	title: string;
	/** What it removes, for the person to read before agreeing. */
	children: ReactNode;
	confirmLabel: string;
	onConfirm: (typed: string) => Promise<void>;
	/**
	 * What has to be typed first, and the line that asks for it: with `expected`, exactly that;
	 * with `password`, anything, hidden as it is typed, for the server to check.
	 */
	typed?: { label: string; expected: string } | { label: string; password: true };
	variant?: "outline" | "ghost";
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();
	const [text, setText] = useState("");
	const secret = typed !== undefined && "password" in typed;
	const matches =
		!typed ||
		("password" in typed
			? text.length > 0
			: text.trim().toLowerCase() === typed.expected.trim().toLowerCase());

	const confirm = async () => {
		setBusy(true);
		setFailure(undefined);
		try {
			// A password is handed on as typed: a space can be part of one.
			await onConfirm(secret ? text : text.trim());
			dialog.current?.close();
		} catch (error) {
			setFailure(refusalText(error).message);
		}
		setBusy(false);
	};

	return (
		<>
			{/* It opens a dialog through the page's script, so it waits for the script. */}
			<LiveButton
				variant={variant}
				onClick={() => {
					setText("");
					setFailure(undefined);
					dialog.current?.showModal();
				}}
			>
				{label}
			</LiveButton>
			<dialog
				ref={dialog}
				aria-labelledby={titleId}
				className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border bg-card p-5 text-card-foreground backdrop:bg-black/50"
			>
				<div className="flex flex-col gap-4">
					<h2 id={titleId} className="text-lg font-semibold">
						{title}
					</h2>
					<div className="flex flex-col gap-2 text-sm">{children}</div>
					{typed && (
						<label className="flex flex-col gap-1.5 text-sm font-medium break-words">
							{typed.label}
							<input
								type={secret ? "password" : "text"}
								autoComplete={secret ? "current-password" : "off"}
								autoCapitalize="off"
								spellCheck={false}
								className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal"
								value={text}
								onChange={(event) => setText(event.target.value)}
							/>
						</label>
					)}
					{failure && (
						<p role="alert" className="font-medium text-destructive">
							{failure}
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							className="bg-destructive text-white hover:bg-destructive/90"
							disabled={busy || !matches}
							onClick={() => void confirm()}
						>
							{confirmLabel}
						</Button>
						<Button variant="outline" onClick={() => dialog.current?.close()}>
							{strings.owner.cancel}
						</Button>
					</div>
				</div>
			</dialog>
		</>
	);
}
