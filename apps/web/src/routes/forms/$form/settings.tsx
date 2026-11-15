import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LiveButton } from "#/components/live-button";
import { BringIn } from "#/components/owner/bring-in";
import { ConfirmButton } from "#/components/owner/confirm";
import { owner } from "#/lib/owner-client";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/settings")({ component: SettingsPage });

const form = getRouteApi("/forms/$form");
const t = strings.owner.settings;

function SettingsPage() {
	const { id, state, versions, holds } = form.useLoaderData();
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const setState = async (next: "open" | "closed") => {
		await owner("POST", `forms/${encodeURIComponent(id)}/state`, { state: next });
		await router.invalidate();
	};

	const open = async () => {
		setBusy(true);
		setFailed(false);
		await setState("open").catch(() => setFailed(true));
		setBusy(false);
	};

	return (
		<>
			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.stateTitle}</h2>
				<p>{t[state]}</p>
				{state === "open" ? (
					<div>
						<ConfirmButton
							label={t.closeIt}
							title={t.closeTitle}
							confirmLabel={t.closeIt}
							onConfirm={() => setState("closed")}
						>
							<p>{t.closeBody}</p>
						</ConfirmButton>
					</div>
				) : (
					<LiveButton className="self-start" disabled={busy} onClick={() => void open()}>
						{t.openIt}
					</LiveButton>
				)}
				{failed && (
					<p role="alert" className="font-medium text-destructive">
						{strings.owner.failed}
					</p>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.versionsTitle}</h2>
				<p className="text-sm text-muted-foreground">{t.versionsLead}</p>
				<ul className="flex flex-col gap-2">
					{versions.map((version) => (
						<li key={version.hash} className="rounded-lg border px-4 py-3">
							<p className="font-medium break-words">
								{t.version(version.hash)} · {version.title}
							</p>
							<p className="text-sm text-muted-foreground">
								{strings.owner.counts(version.started, version.completed)}
								{version.current && ` · ${t.current}`}
							</p>
						</li>
					))}
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.replaceTitle}</h2>
				<p className="text-sm text-muted-foreground">{t.replaceLead}</p>
				<BringIn
					acceptLabel={strings.owner.bringIn.replace}
					onAccept={async (definition) => {
						await owner("POST", `forms/${encodeURIComponent(id)}/definition`, { definition });
						await router.invalidate();
					}}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.deleteTitle}</h2>
				<p>{t.deleteLead(holds.responses, holds.answers, holds.detached)}</p>
				{holds.responses + holds.detached > 0 && (
					<div>
						<ConfirmButton
							label={t.deleteAll}
							title={t.deleteAllTitle}
							confirmLabel={t.deleteAllConfirm(holds.responses)}
							onConfirm={async () => {
								await owner("DELETE", `forms/${encodeURIComponent(id)}/responses`);
								await router.invalidate();
							}}
						>
							<p>{t.deleteLead(holds.responses, holds.answers, holds.detached)}</p>
							<p>{t.deleteAllBody}</p>
						</ConfirmButton>
					</div>
				)}
			</section>
		</>
	);
}
