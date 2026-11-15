import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { storedAddress } from "#/components/about-form";
import { LiveButton } from "#/components/live-button";
import { BringIn, refusalText } from "#/components/owner/bring-in";
import { ConfirmButton } from "#/components/owner/confirm";
import { owner } from "#/lib/owner-client";
import { strings } from "#/lib/strings";

export const Route = createFileRoute("/forms/$form/settings")({ component: SettingsPage });

const form = getRouteApi("/forms/$form");
const t = strings.owner.settings;

const field =
	"min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal";

/**
 * Who runs the form, to fill in or change. There is no builder, so this is the one line of a
 * definition that can be written here: a form brought in from elsewhere has none, and cannot
 * be opened without it.
 */
function ControllerForm({
	formId,
	controller,
	saved,
	onSaved,
}: {
	formId: string;
	controller: { name: string; contact: string } | null;
	/** Held by the page: saving changes what is stored, which makes these fields anew. */
	saved: boolean;
	onSaved: (saved: boolean) => void;
}) {
	const router = useRouter();
	const [saving, setSaving] = useState(false);
	const [failure, setFailure] = useState<string>();

	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		setSaving(true);
		setFailure(undefined);
		onSaved(false);
		try {
			await owner("POST", `forms/${encodeURIComponent(formId)}/controller`, {
				name: String(data.get("name")),
				contact: String(data.get("contact")),
			});
			onSaved(true);
			await router.invalidate();
		} catch (error) {
			setFailure(refusalText(error).message);
		}
		setSaving(false);
	};

	return (
		<form onSubmit={save} className="flex flex-col gap-3">
			<label className="flex flex-col gap-1.5 font-medium">
				{t.controllerName}
				<input
					name="name"
					required
					maxLength={200}
					defaultValue={controller?.name ?? ""}
					className={field}
				/>
			</label>
			<label className="flex flex-col gap-1.5 font-medium">
				{t.controllerContact}
				<input
					name="contact"
					required
					maxLength={300}
					defaultValue={controller?.contact ?? ""}
					className={field}
				/>
			</label>
			<p className="text-sm text-muted-foreground">{t.controllerNote}</p>
			{failure && (
				<p role="alert" className="font-medium text-destructive">
					{failure}
				</p>
			)}
			{saved && (
				<p role="status" className="font-medium">
					{t.controllerSaved}
				</p>
			)}
			<LiveButton type="submit" variant="outline" className="self-start" disabled={saving}>
				{t.controllerSave}
			</LiveButton>
		</form>
	);
}

function SettingsPage() {
	const { id, state, controller, withdrawal, versions, holds } = form.useLoaderData();
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();
	const [controllerSaved, setControllerSaved] = useState(false);

	const setState = async (next: "open" | "closed") => {
		await owner("POST", `forms/${encodeURIComponent(id)}/state`, { state: next });
		await router.invalidate();
	};

	const open = async () => {
		setBusy(true);
		setFailure(undefined);
		// In the server's words when it has any: it says what the form is missing.
		await setState("open").catch((error: unknown) => setFailure(refusalText(error).message));
		setBusy(false);
	};

	return (
		<>
			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.stateTitle}</h2>
				<p>{t[state]}</p>
				{!controller && state !== "open" && (
					<p role="status" className="rounded-lg border px-4 py-3 font-medium">
						{t.controllerMissing}
					</p>
				)}
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
					<LiveButton
						className="self-start"
						disabled={busy || !controller}
						onClick={() => void open()}
					>
						{t.openIt}
					</LiveButton>
				)}
				{failure && (
					<p role="alert" className="font-medium text-destructive">
						{failure}
					</p>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.controllerTitle}</h2>
				<p className="text-sm text-muted-foreground">{t.controllerLead}</p>
				{/* Keyed by what is stored, so that the fields show a new definition's own line. */}
				<ControllerForm
					key={`${controller?.name} ${controller?.contact}`}
					formId={id}
					controller={controller}
					saved={controllerSaved}
					onSaved={setControllerSaved}
				/>
				{state !== "draft" && (
					<a
						href={storedAddress(id)}
						target="_blank"
						rel="noopener"
						className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4"
					>
						{t.storedLink}
					</a>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.withdrawalTitle}</h2>
				<p>{t.withdrawal[withdrawal]}</p>
				<p className="text-sm text-muted-foreground">{t.withdrawalHow}</p>
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
								{version.withdrawn > 0 && (
									<span data-withdrawn={version.withdrawn}>
										{" "}
										· {t.withdrawn(version.withdrawn)}
									</span>
								)}
								{version.current && ` · ${t.current}`}
							</p>
						</li>
					))}
				</ul>
				{versions.some((version) => version.withdrawn > 0) && (
					<p className="text-sm text-muted-foreground">{t.withdrawnNote}</p>
				)}
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
				{/* While the form is open the button is always there: leaving it out when nothing
				    is kept apart would say what the line above does not. */}
				{(holds.detached === null || holds.responses + holds.detached > 0) && (
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

			<section className="flex flex-col gap-3">
				<h2 className="text-lg font-semibold">{t.deleteFormTitle}</h2>
				<p>{t.deleteFormLead}</p>
				<div>
					<ConfirmButton
						label={t.deleteForm}
						title={t.deleteFormDialog}
						confirmLabel={t.deleteFormConfirm}
						typed={{ label: t.deleteFormType(id), expected: id }}
						onConfirm={async (confirm) => {
							await owner("DELETE", `forms/${encodeURIComponent(id)}`, { confirm });
							// The form's own pages are gone with it.
							await router.navigate({ to: "/forms" });
						}}
					>
						<p>
							{t.deleteFormHolds(holds.responses, holds.answers, holds.detached, versions.length)}
						</p>
						<p>{t.deleteFormBody}</p>
					</ConfirmButton>
				</div>
			</section>
		</>
	);
}
