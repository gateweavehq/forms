import type { ReactNode } from "react";

/** A short message that fills the page: not found, an error, a form that cannot be opened. */
export function Notice({
	title,
	children,
	action,
}: {
	title: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-5 py-10">
			<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
			<p className="text-base text-muted-foreground">{children}</p>
			{action && <div>{action}</div>}
		</main>
	);
}
