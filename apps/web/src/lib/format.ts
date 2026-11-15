/** A length of time for a person: seconds under a minute, minutes and seconds above. */
export function duration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds} s`;
	const rest = seconds % 60;
	return rest === 0
		? `${Math.floor(seconds / 60)} min`
		: `${Math.floor(seconds / 60)} min ${rest} s`;
}

/** A share from 0 to 1 as a whole percentage. */
export function percent(share: number): string {
	return `${Math.round(share * 100)}%`;
}

/**
 * A moment as text, in UTC. The server renders the page before the browser does, and the two
 * must write the same thing: the browser's own time zone would differ from the server's.
 */
export function moment(time: number): string {
	return `${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** A number with at most one decimal. */
export function rounded(value: number): string {
	return String(Math.round(value * 10) / 10);
}
