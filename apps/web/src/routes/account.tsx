import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/button";
import { LiveButton } from "#/components/live-button";
import { authClient } from "#/lib/auth-client";
import { getUser } from "#/lib/session";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/account")({
	loader: async () => {
		const user = await getUser();
		if (!user) throw redirect({ to: "/login", search: { redirect: "/account" } });
		return user;
	},
	head: () => ({ meta: [{ title: `${strings.account.title} · ${strings.product}` }] }),
	component: AccountPage,
});

const field =
	"min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground";

function AccountPage() {
	const user = Route.useLoaderData();
	const router = useRouter();
	const [message, setMessage] = useState<{ text: string; bad: boolean }>();
	const [pending, setPending] = useState(false);

	async function signOut() {
		await authClient.signOut();
		await router.invalidate();
		await router.navigate({ to: "/login" });
	}

	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		setPending(true);
		setMessage(undefined);
		const result = await authClient.changePassword({
			currentPassword: String(data.get("current")),
			newPassword: String(data.get("next")),
			// Whoever knew the old password may be why it is changing.
			revokeOtherSessions: true,
		});
		setPending(false);
		if (result.error) {
			setMessage({ text: strings.account.passwordRefused, bad: true });
			return;
		}
		form.reset();
		setMessage({ text: strings.account.passwordChanged, bad: false });
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
			<div className="flex flex-col gap-2">
				<Link to="/forms" className="text-sm text-muted-foreground underline underline-offset-4">
					{strings.owner.backToForms}
				</Link>
				<h1 className="text-2xl font-semibold tracking-tight">{strings.account.title}</h1>
				<p className="text-muted-foreground">
					{user.name} · {user.email}
				</p>
			</div>
			<form onSubmit={changePassword} className="flex flex-col gap-4">
				<h2 className="text-lg font-semibold">{strings.account.changePassword}</h2>
				<label className="flex flex-col gap-1.5 font-medium">
					{strings.account.current}
					<input
						name="current"
						type="password"
						autoComplete="current-password"
						required
						className={field}
					/>
				</label>
				<label className="flex flex-col gap-1.5 font-medium">
					{strings.account.next}
					<input
						name="next"
						type="password"
						minLength={8}
						autoComplete="new-password"
						required
						className={field}
					/>
				</label>
				{message && (
					<p
						role={message.bad ? "alert" : "status"}
						className={message.bad ? "font-medium text-destructive" : "font-medium"}
					>
						{message.text}
					</p>
				)}
				<LiveButton type="submit" className="self-start" disabled={pending}>
					{strings.account.changePassword}
				</LiveButton>
			</form>
			<Button variant="outline" className="self-start" onClick={() => void signOut()}>
				{strings.auth.signOut}
			</Button>
		</main>
	);
}
