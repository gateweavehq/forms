import type { RichText, Span } from "@gateweave/forms-schema";
import { cn } from "#/lib/cn";
import { strings } from "#/lib/strings";

function SpanView({ span }: { span: Span }) {
	const className = cn(span.bold && "font-semibold", span.italic && "italic");
	if (span.href) {
		return (
			// A new tab, so that following a link never leaves the form half-answered.
			<a
				href={span.href}
				target="_blank"
				rel="noopener noreferrer"
				className={cn("underline underline-offset-4", className)}
			>
				{span.text}
			</a>
		);
	}
	return className ? <span className={className}>{span.text}</span> : span.text;
}

/**
 * An author's text: paragraphs with bold, italic and links. It is rendered from data, never as
 * HTML, so nothing in a form's text can run in the respondent's page.
 */
export function RichTextView({ text, className }: { text: RichText; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{text.map((paragraph, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a text's paragraphs never change place
				<p key={index} className="whitespace-pre-line break-words">
					{typeof paragraph === "string"
						? paragraph
						: paragraph.map((span, at) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: nor do a paragraph's spans
								<SpanView key={at} span={span} />
							))}
				</p>
			))}
		</div>
	);
}

/** Longer text behind a control, closed until asked for: reading it is the person's choice. */
export function More({ text }: { text: RichText }) {
	return (
		<details className="group">
			<summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
				<span
					aria-hidden="true"
					className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
				>
					›
				</span>
				{strings.card.more}
			</summary>
			<RichTextView text={text} className="pb-2 text-sm text-muted-foreground" />
		</details>
	);
}
