import { type ReactNode, useId, useRef, useState } from "react";
import { strings } from "#/lib/strings";
import { Button } from "../button";
import { refusalText } from "./bring-in";

/**
 * A button that asks before it acts. The dialog says what will be removed, in numbers, and the
 * button that goes ahead repeats what it does: nobody should delete a study's answers by
 * pressing "OK".
 */
export function ConfirmButton({
	label,
	title,
	children,
	confirmLabel,
	onConfirm,
	variant = "outline",
}: {
	label: string;
	title: string;
	/** What it removes, for the person to read before agreeing. */
	children: ReactNode;
	confirmLabel: string;
	onConfirm: () => Promise<void>;
	variant?: "outline" | "ghost";
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();

	const confirm = async () => {
		setBusy(true);
		setFailure(undefined);
		try {
			await onConfirm();
			dialog.current?.close();
		} catch (error) {
			setFailure(refusalText(error).message);
		}
		setBusy(false);
	};

	return (
		<>
			<Button variant={variant} onClick={() => dialog.current?.showModal()}>
				{label}
			</Button>
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
					{failure && (
						<p role="alert" className="font-medium text-destructive">
							{failure}
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							className="bg-destructive text-white hover:bg-destructive/90"
							disabled={busy}
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
