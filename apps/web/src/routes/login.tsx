import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { LiveButton } from "#/components/live-button";
import { authClient } from "#/lib/auth-client";
import { safeRedirect } from "#/lib/redirect";
import { getSignUpClosed, getUser } from "#/lib/session";
import { strings } from "#/lib/strings";

const loginSearch = z.object({
	/** Where to go once signed in, such as the form's page that sent the person here. */
	redirect: z.string().optional().catch(undefined),
	mode: z.enum(["sign-in", "sign-up"]).optional().catch(undefined),
});

export const Route = createFileRoute("/login")({
	validateSearch: loginSearch,
	beforeLoad: async ({ search }) => {
		if (await getUser()) throw redirect({ href: safeRedirect(search.redirect) ?? "/forms" });
	},
	loader: async () => ({ signUpClosed: await getSignUpClosed() }),
	head: () => ({ meta: [{ title: `${strings.auth.signIn} · ${strings.product}` }] }),
	component: LoginPage,
});

const field =
	"min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground";

/** What to say for a refusal: the app's own words for the ones it knows, else a general line. */
function refusal(error: { code?: string | undefined; status: number }): string {
	if (error.code === "SIGN_UP_CLOSED") return strings.auth.closed;
	if (error.code === "TOO_MANY_TRIES" || error.status === 429) return strings.auth.tooMany;
	if (error.code === "INVALID_EMAIL_OR_PASSWORD") return strings.auth.wrong;
	if (
		error.code === "USER_ALREADY_EXISTS" ||
		error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
	) {
		return strings.auth.exists;
	}
	if (error.code === "PASSWORD_TOO_SHORT") return strings.auth.tooShort;
	return strings.auth.failed;
}

function LoginPage() {
	const { signUpClosed } = Route.useLoaderData();
	const search = Route.useSearch();
	const next = safeRedirect(search.redirect) ?? "/forms";
	const router = useRouter();
	const [mode, setMode] = useState<"sign-in" | "sign-up">(search.mode ?? "sign-in");
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);
	const signingIn = mode === "sign-in";

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const email = String(form.get("email"));
		const password = String(form.get("password"));
		setPending(true);
		setError(undefined);
		const result = signingIn
			? await authClient.signIn.email({ email, password })
			: await authClient.signUp.email({ email, password, name: String(form.get("name")) });
		setPending(false);
		if (result.error) {
			setError(refusal(result.error));
			return;
		}
		await router.invalidate();
		await router.navigate({ href: next });
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
			<div className="flex flex-col gap-1.5">
				<h1 className="text-2xl font-semibold tracking-tight">
					{signingIn ? strings.auth.signInTitle : strings.auth.signUpTitle}
				</h1>
				<p className="text-muted-foreground">{strings.auth.lead}</p>
			</div>
			{signUpClosed && <p className="text-sm text-muted-foreground">{strings.auth.closedNote}</p>}
			<form onSubmit={onSubmit} className="flex flex-col gap-4">
				{!signingIn && (
					<label className="flex flex-col gap-1.5 font-medium">
						{strings.auth.name}
						<input name="name" autoComplete="name" maxLength={100} required className={field} />
					</label>
				)}
				<label className="flex flex-col gap-1.5 font-medium">
					{strings.auth.email}
					<input name="email" type="email" autoComplete="email" required className={field} />
				</label>
				<label className="flex flex-col gap-1.5 font-medium">
					{strings.auth.password}
					<input
						name="password"
						type="password"
						minLength={8}
						autoComplete={signingIn ? "current-password" : "new-password"}
						required
						className={field}
					/>
				</label>
				{error && (
					<p role="alert" className="font-medium text-destructive">
						{error}
					</p>
				)}
				<LiveButton type="submit" disabled={pending}>
					{signingIn ? strings.auth.signIn : strings.auth.signUp}
				</LiveButton>
			</form>
			<p className="text-sm text-muted-foreground">
				{signingIn ? strings.auth.noAccount : strings.auth.haveAccount}{" "}
				<button
					type="button"
					className="min-h-11 font-medium text-foreground underline underline-offset-4"
					onClick={() => {
						setMode(signingIn ? "sign-up" : "sign-in");
						setError(undefined);
					}}
				>
					{signingIn ? strings.auth.signUp : strings.auth.signIn}
				</button>
			</p>
		</main>
	);
}
