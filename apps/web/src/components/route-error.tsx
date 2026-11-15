import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { strings } from "#/lib/strings";
import { Button } from "./button";
import { Notice } from "./notice";

/** What a page shows when it fails to load, with a retry. */
export function RouteError({ error }: ErrorComponentProps) {
	const router = useRouter();
	return (
		<Notice
			title={strings.error.title}
			action={
				<Button variant="outline" onClick={() => void router.invalidate()}>
					{strings.error.retry}
				</Button>
			}
		>
			{error instanceof Error && error.message ? error.message : strings.error.body}
		</Notice>
	);
}
