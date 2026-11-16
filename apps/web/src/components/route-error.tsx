import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { referenceIn } from "#/lib/error-reference";
import { strings } from "#/lib/strings";
import { Button } from "./button";
import { Notice } from "./notice";

/**
 * What a page shows when it fails to load, with a retry. No more than that it failed, never the
 * error's own message: it comes from the server, and what failed there may have put anything in
 * it, as a failed database query once put its statement and values. A reference, if the failure
 * has one, is shown so that whoever runs the server can find it in the log.
 */
export function RouteError({ error }: ErrorComponentProps) {
	const router = useRouter();
	const reference = referenceIn(error);
	return (
		<Notice
			title={strings.error.title}
			action={
				<Button variant="outline" onClick={() => void router.invalidate()}>
					{strings.error.retry}
				</Button>
			}
		>
			{strings.error.body}
			{reference && (
				<>
					{" "}
					{strings.error.reference} <code>{reference}</code>.
				</>
			)}
		</Notice>
	);
}
