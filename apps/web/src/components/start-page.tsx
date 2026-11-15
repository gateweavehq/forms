import type { Definition } from "@gateweave/forms-schema";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { RequestFailed, startResponse } from "#/lib/client";
import { deviceClass } from "#/lib/device";
import { rememberedResponse, rememberResponse, type SavedResponse } from "#/lib/local";
import { strings } from "#/lib/strings";
import { Button } from "./button";
import { RichTextView } from "./rich-text";

/**
 * A form's first page: its title, and its consent when it has one. Nothing is stored and no
 * question is shown until the person agrees and starts; that is when their response is made.
 */
export function StartPage({ definition }: { definition: Definition }) {
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

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
			<h1 className="text-3xl font-semibold tracking-tight text-balance break-words">
				{definition.title}
			</h1>
			{saved && (
				<section className="flex flex-col gap-3 rounded-xl border p-4">
					<h2 className="font-semibold">{strings.start.resumeTitle}</h2>
					<Button className="self-start" onClick={() => void open(saved)}>
						{strings.start.resume}
					</Button>
					<p className="text-sm text-muted-foreground">{strings.start.startOver}</p>
				</section>
			)}
			<form className="flex flex-col gap-6" onSubmit={start} noValidate>
				{consent && (
					<>
						{consent.title && <h2 className="text-xl font-semibold">{consent.title}</h2>}
						<RichTextView text={consent.text} />
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
				)}
				{problem && (
					<p id={problemId} role="alert" className="font-medium text-destructive">
						{problem}
					</p>
				)}
				<Button type="submit" className="self-start px-8" disabled={!ready || starting}>
					{strings.start.begin}
				</Button>
			</form>
		</main>
	);
}
