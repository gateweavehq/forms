import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/button";
import { LiveButton } from "#/components/live-button";
import { ConfirmButton } from "#/components/owner/confirm";
import { authClient } from "#/lib/auth-client";
import { getMyForms } from "#/lib/owner";
import { owner } from "#/lib/owner-client";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/account")({
	loader: async () => {
		const mine = await getMyForms();
		if (!mine) throw redirect({ to: "/login", search: { redirect: "/account" } });
		// How many forms the account has decides whether it can be deleted.
		return { user: mine.user, forms: mine.forms.length };
	},
	head: () => ({ meta: [{ title: `${strings.account.title} · ${strings.product}` }] }),
	component: AccountPage,
});

const field =
	"min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground";

function AccountPage() {
	const { user, forms } = Route.useLoaderData();
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
			<section className="flex flex-col gap-3 border-t pt-6">
				<h2 className="text-lg font-semibold">{strings.account.deleteTitle}</h2>
				<p className="text-sm text-muted-foreground">{strings.account.deleteLead}</p>
				{forms > 0 ? (
					// Said before the button, not after pressing it. The server refuses all the same.
					<p role="status" className="rounded-lg border px-4 py-3">
						{strings.account.deleteBlocked(forms)}{" "}
						<Link to="/forms" className="font-medium underline underline-offset-4">
							{strings.owner.forms}
						</Link>
					</p>
				) : (
					<div>
						<ConfirmButton
							label={strings.account.delete}
							title={strings.account.deleteDialog}
							confirmLabel={strings.account.deleteConfirm}
							typed={{ label: strings.account.deleteType(user.email), expected: user.email }}
							onConfirm={async (confirm) => {
								await owner("DELETE", "account", { confirm });
								await router.invalidate();
								await router.navigate({ to: "/login" });
							}}
						>
							<p>{strings.account.deleteBody}</p>
						</ConfirmButton>
					</div>
				)}
			</section>
		</main>
	);
}
