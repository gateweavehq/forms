import type { Withdrawal } from "@gateweave/forms-schema";
import { useNavigate } from "@tanstack/react-router";
import { type Ref, useId, useImperativeHandle, useRef, useState } from "react";
import { withdrawResponse } from "#/lib/client";
import { forgetResponse } from "#/lib/local";
import { strings } from "#/lib/strings";
import { Button } from "./button";

const t = strings.yours;

/** The address of a form's consent text on its own, in the wording a response began under. */
export function consentAddress(formId: string, version?: string): string {
	const query = version ? `?v=${encodeURIComponent(version)}` : "";
	return `/f/${encodeURIComponent(formId)}/consent${query}`;
}

export interface YourAnswersHandle {
	open: () => void;
}

/**
 * What a person can do about their own answers while the form is open: keep a copy of what they
 * agreed to, make this browser forget the way back, or take everything back. There is no
 * account to do it from; the secret in the address is what allows it.
 *
 * It is a dialog alone. What opens it lives in the options menu, which calls `open` on the ref.
 */
export function YourAnswers({
	ref,
	formId,
	responseId,
	secret,
	version,
	hasConsent,
	withdrawal,
	onWithdrawn,
	onClose,
}: {
	ref: Ref<YourAnswersHandle>;
	formId: string;
	responseId: string;
	secret: string;
	/** Names the wording the response began under. */
	version: string;
	hasConsent: boolean;
	withdrawal: Withdrawal;
	onWithdrawn: () => void;
	/** Called when the dialog has closed, to put the focus back where it came from. */
	onClose?: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const navigate = useNavigate();
	const [asking, setAsking] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const open = () => {
		setAsking(false);
		setFailed(false);
		dialog.current?.showModal();
	};
	useImperativeHandle(ref, () => ({ open }));

	const forget = () => {
		forgetResponse(formId);
		// Replaced, so that Back does not lead to the address that was just forgotten.
		void navigate({ to: "/f/$form", params: { form: formId }, replace: true });
	};

	const withdraw = async () => {
		setBusy(true);
		setFailed(false);
		try {
			await withdrawResponse(responseId, secret);
			forgetResponse(formId);
			dialog.current?.close();
			onWithdrawn();
		} catch {
			setFailed(true);
			setBusy(false);
		}
	};

	return (
		<dialog
			ref={dialog}
			aria-labelledby={titleId}
			onClose={onClose}
			className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border bg-card p-5 text-card-foreground backdrop:bg-black/50"
		>
			<div className="flex flex-col gap-5">
				<h2 id={titleId} className="text-lg font-semibold">
					{t.title}
				</h2>
				{hasConsent && (
					<a
						href={consentAddress(formId, version)}
						target="_blank"
						rel="noopener"
						className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
					>
						{t.consentCopy}
					</a>
				)}
				<section className="flex flex-col gap-2">
					<h3 className="font-medium">{t.forgetTitle}</h3>
					<p className="text-sm text-muted-foreground">{t.forgetBody}</p>
					<Button variant="outline" className="self-start" onClick={forget}>
						{t.forget}
					</Button>
				</section>
				<section className="flex flex-col gap-2">
					<h3 className="font-medium">{t.withdrawTitle}</h3>
					<p className="text-sm text-muted-foreground">{t.withdrawBody[withdrawal]}</p>
					{asking ? (
						<div className="flex flex-wrap items-center gap-2">
							<p className="w-full font-medium">{t.withdrawSure}</p>
							<Button
								className="bg-destructive text-white hover:bg-destructive/90"
								disabled={busy}
								onClick={() => void withdraw()}
							>
								{t.withdrawConfirm}
							</Button>
							<Button variant="outline" onClick={() => setAsking(false)}>
								{strings.owner.cancel}
							</Button>
						</div>
					) : (
						<Button variant="outline" className="self-start" onClick={() => setAsking(true)}>
							{t.withdraw}
						</Button>
					)}
					{failed && (
						<p role="alert" className="font-medium text-destructive">
							{t.withdrawFailed}
						</p>
					)}
				</section>
				<Button variant="outline" className="self-start" onClick={() => dialog.current?.close()}>
					{t.close}
				</Button>
			</div>
		</dialog>
	);
}
