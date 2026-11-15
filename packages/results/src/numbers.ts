/**
 * The middle value: of an odd count the one in the middle, of an even count the mean of the two
 * in the middle. Nothing for no values, because a median of nothing is not zero.
 */
export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const upper = sorted[middle] ?? 0;
	if (sorted.length % 2 === 1) return upper;
	return ((sorted[middle - 1] ?? 0) + upper) / 2;
}

export function mean(values: number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A part of a whole as a number from 0 to 1, or nothing when there is no whole. */
export function share(part: number, whole: number): number | null {
	return whole === 0 ? null : part / whole;
}
