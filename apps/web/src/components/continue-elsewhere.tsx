import { useId, useRef, useState } from "react";
import { responseAddress } from "#/lib/local";
import { strings } from "#/lib/strings";
import { Button } from "./button";

/**
 * Shows the address that opens this response anywhere. There is no account to sign in to on the
 * other device: the address is the way in, which is why the text says to keep it private.
 */
export function ContinueElsewhere({
	formId,
	responseId,
	secret,
}: {
	formId: string;
	responseId: string;
	secret: string;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const [address, setAddress] = useState("");
	const [copied, setCopied] = useState(false);

	const open = () => {
		const path = responseAddress(formId, { id: responseId, secret });
		setAddress(`${window.location.origin}${path}`);
		setCopied(false);
		dialog.current?.showModal();
	};

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(address);
			setCopied(true);
		} catch {
			// No clipboard here (an old browser, a page not served securely): the address is
			// selected in its box, ready to be copied by hand.
		}
	};

	return (
		<>
			<Button variant="ghost" className="-ml-4 text-sm" onClick={open}>
				{strings.elsewhere.open}
			</Button>
			<dialog
				ref={dialog}
				aria-labelledby={titleId}
				className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border bg-card p-5 text-card-foreground backdrop:bg-black/50"
			>
				<div className="flex flex-col gap-4">
					<h2 id={titleId} className="text-lg font-semibold">
						{strings.elsewhere.title}
					</h2>
					<p className="text-sm text-muted-foreground">{strings.elsewhere.body}</p>
					<textarea
						readOnly
						rows={4}
						aria-labelledby={titleId}
						className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-sm break-all"
						value={address}
						onFocus={(event) => event.target.select()}
					/>
					<div className="flex flex-wrap gap-2">
						<Button onClick={() => void copy()}>
							<span aria-live="polite">
								{copied ? strings.elsewhere.copied : strings.elsewhere.copy}
							</span>
						</Button>
						<Button variant="outline" onClick={() => dialog.current?.close()}>
							{strings.elsewhere.close}
						</Button>
					</div>
				</div>
			</dialog>
		</>
	);
}
