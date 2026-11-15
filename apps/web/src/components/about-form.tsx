import type { Controller, Withdrawal } from "@gateweave/forms-schema";
import { cn } from "#/lib/cn";
import { strings } from "#/lib/strings";

const t = strings.about;

/** The address of the page that lists what a form stores, in the wording a response began under. */
export function storedAddress(formId: string, version?: string): string {
	const query = version ? `?v=${encodeURIComponent(version)}` : "";
	return `/f/${encodeURIComponent(formId)}/stored${query}`;
}

/**
 * How to reach whoever runs a form. An email address becomes a link that writes to it and a web
 * address one that opens it; anything else (a postal address, a telephone number) is shown as
 * it was written.
 */
export function Contact({ contact }: { contact: string }) {
	const link = "underline underline-offset-4";
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
		return (
			<a href={`mailto:${contact}`} className={link}>
				{contact}
			</a>
		);
	}
	if (/^https:\/\/\S+$/.test(contact)) {
		return (
			<a href={contact} target="_blank" rel="noopener noreferrer" className={link}>
				{contact}
			</a>
		);
	}
	return contact;
}

/**
 * What a person is told before they answer, beyond the form's own words: who runs it and how to
 * reach them, until when they can take their answers back, and where to read what is stored.
 */
export function AboutForm({
	formId,
	controller,
	withdrawal,
	closed = false,
	version,
	className,
}: {
	formId: string;
	/** Absent only on a form opened before one was required. */
	controller: Controller | undefined;
	withdrawal: Withdrawal;
	/** The form takes no new answers, which ends "for as long as it is open". */
	closed?: boolean;
	version?: string;
	className?: string;
}) {
	return (
		<section
			aria-label={t.label}
			className={cn("flex flex-col gap-2 text-sm text-muted-foreground", className)}
		>
			{controller && (
				<p className="break-words">
					{t.runBy} <span className="font-medium text-foreground">{controller.name}</span>
					{" · "}
					<Contact contact={controller.contact} />
				</p>
			)}
			<p>{closed && withdrawal === "until-closed" ? t.closed : t.withdrawal[withdrawal]}</p>
			<a
				href={storedAddress(formId, version)}
				target="_blank"
				rel="noopener"
				className="inline-flex min-h-11 items-center self-start underline underline-offset-4"
			>
				{t.stored}
			</a>
		</section>
	);
}
