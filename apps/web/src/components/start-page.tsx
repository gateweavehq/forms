import { type Definition, withdrawalOf } from "@gateweave/forms-schema";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { RequestFailed, startResponse } from "#/lib/client";
import { cn } from "#/lib/cn";
import { deviceClass } from "#/lib/device";
import {
	forgetResponse,
	rememberedResponse,
	rememberResponse,
	type SavedResponse,
} from "#/lib/local";
import { strings } from "#/lib/strings";
import { AboutForm } from "./about-form";
import { Button } from "./button";
import { MadeWith } from "./card-frame";
import { RichTextView } from "./rich-text";
import { consentAddress } from "./your-answers";

/**
 * A form's first page: its title, and its consent when it has one. Nothing is stored and no
 * question is shown until the person agrees and starts; that is when their response is made.
 */
export function StartPage({
	definition,
	closed = false,
}: {
	definition: Definition;
	/** The form takes no new responses. One already begun on this device can still be finished. */
	closed?: boolean;
}) {
	const navigate = useNavigate();
	const { consent } = definition;
	const [problem, setProblem] = useState<string>();
	const [starting, setStarting] = useState(false);
	const [saved, setSaved] = useState<SavedResponse>();
	// The page arrives as HTML before its script runs. Until then a press on Start would submit
	// the form the browser's own way and reload the page, so the button waits for the script.
	const [ready, setReady] = useState(false);
	const box = useRef<HTMLInputElement>(null);
	const problemId = useId();

	// Read after the page has loaded: the server does not know what this browser remembers.
	useEffect(() => {
		setSaved(rememberedResponse(definition.id));
		setReady(true);
	}, [definition.id]);

	const open = (response: SavedResponse) =>
		navigate({
			to: "/f/$form/r/$response",
			params: { form: definition.id, response: response.id },
			hash: response.secret,
		});

	const start = async (event: FormEvent) => {
		event.preventDefault();
		if (consent && !box.current?.checked) {
			setProblem(strings.start.consentNeeded);
			box.current?.focus();
			return;
		}
		setStarting(true);
		setProblem(undefined);
		try {
			const started = await startResponse(
				definition.id,
				deviceClass(window.innerWidth),
				consent !== undefined,
			);
			rememberResponse(definition.id, started);
			await open(started);
		} catch (error) {
			setStarting(false);
			const busy = error instanceof RequestFailed && error.status === 429;
			setProblem(busy ? strings.start.busy : strings.start.failed);
		}
	};

	const startButton = (
		<Button
			type="submit"
			variant={saved ? "outline" : "primary"}
			className={cn("min-h-12 w-full sm:w-auto sm:min-w-32", saved && "bg-card")}
			disabled={!ready || starting}
		>
			{saved ? strings.start.again : strings.start.begin}
		</Button>
	);

	// The same page as a card's: the form on a surface, and under it a bar that stays where a
	// thumb is on a phone, whichever hand holds it, so its buttons take the bar's whole width.
	return (
		<div className="min-h-svh overflow-x-clip bg-page">
			<main className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-2 pt-2 sm:px-6 sm:py-10">
				<form className="flex flex-1 flex-col" onSubmit={start} noValidate>
					{/* A page with little on it stands in the middle of a phone, not in its top corner. */}
					<div className="my-auto flex flex-col gap-5 rounded-xl border bg-card p-5 text-card-foreground shadow-xs sm:my-0 sm:gap-6 sm:p-8">
						<h1 className="text-3xl font-semibold tracking-tight text-balance break-words">
							{definition.title}
						</h1>
						{saved && (
							<section className="flex flex-col gap-1 rounded-lg bg-accent px-4 py-3">
								<h2 className="font-semibold">{strings.start.resumeTitle}</h2>
								{!closed && (
									<p className="text-sm text-muted-foreground">{strings.start.startOver}</p>
								)}
								<Button
									variant="outline"
									className="mt-2 self-start bg-card"
									onClick={() => {
										forgetResponse(definition.id);
										setSaved(undefined);
									}}
								>
									{strings.start.forget}
								</Button>
								<p className="text-sm text-muted-foreground">{strings.start.forgetNote}</p>
							</section>
						)}
						{closed ? (
							<p role="status" className="font-medium">
								{strings.start.closed}
							</p>
						) : consent ? (
							<>
								{consent.title && <h2 className="text-xl font-semibold">{consent.title}</h2>}
								<RichTextView text={consent.text} />
								<a
									href={consentAddress(definition.id)}
									target="_blank"
									rel="noopener"
									className="inline-flex min-h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4"
								>
									{strings.start.consentCopy}
								</a>
								<label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-input bg-card px-4 py-3 has-checked:border-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
									{/* Its state stays in the box itself, so a tick made before the script ran counts. */}
									<input
										ref={box}
										type="checkbox"
										className="mt-0.5 size-5 shrink-0 accent-foreground"
										aria-describedby={problem ? problemId : undefined}
										onChange={() => setProblem(undefined)}
									/>
									<span className="min-w-0 break-words">{consent.statement}</span>
								</label>
							</>
						) : (
							<p className="text-muted-foreground">{strings.start.saved}</p>
						)}
						{problem && (
							<p id={problemId} role="alert" className="font-medium text-destructive">
								{problem}
							</p>
						)}
						{/* On a closed form too: someone who answered may be looking for whom to ask. */}
						<AboutForm
							formId={definition.id}
							controller={definition.controller}
							withdrawal={withdrawalOf(definition)}
							closed={closed}
							className="border-t pt-4"
						/>
					</div>
					<MadeWith className="sm:hidden" />
					{/* A closed form with nothing begun on this device has nothing to press. */}
					<div
						data-bar
						hidden={closed && !saved}
						className="card-bar -mx-2 flex flex-col gap-2 bg-page px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:mx-0 sm:flex-row-reverse sm:justify-start sm:gap-3 sm:bg-transparent sm:px-0 sm:pt-4 sm:pb-0"
					>
						{saved && (
							<Button
								className="min-h-12 w-full sm:w-auto"
								disabled={starting}
								onClick={() => void open(saved)}
							>
								{strings.start.resume}
							</Button>
						)}
						{!closed && startButton}
					</div>
					<MadeWith className="mt-6 max-sm:hidden" />
				</form>
			</main>
		</div>
	);
}
