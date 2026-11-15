/** Joins class names, leaving out the ones a condition turned off. */
export function cn(...names: Array<string | false | null | undefined>): string {
	return names.filter(Boolean).join(" ");
}
