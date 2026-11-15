/**
 * Who may make an account, from the `SIGN_UP_ALLOW` setting: whole addresses, separated by
 * commas or spaces. Unset or empty, anyone may sign up, which is right for a server someone
 * runs for themselves and wrong for one on the open internet.
 *
 * An entry that names a domain (`@example.org`) is not taken. No email is sent yet, so nothing
 * proves that someone who types an address at that domain can read its mail: a domain entry
 * would admit anyone who can type. A listed address has the same weakness in the small: it
 * belongs to whoever signs up with it first, so its owner should sign up as soon as it is listed.
 */
export interface AllowList {
	/** Sign-up is limited to a list. True for a list with nothing usable on it, too. */
	closed: boolean;
	addresses: string[];
	/** Entries that were not taken, as written, for the operator to be told about. */
	ignored: string[];
}

export function parseAllowList(setting: string | undefined): AllowList {
	const entries = (setting ?? "")
		.split(/[\s,]+/)
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
	const whole = (entry: string) => entry.indexOf("@") > 0;
	return {
		// A list of nothing but domains must not open the server to everyone.
		closed: entries.length > 0,
		addresses: entries.filter(whole),
		ignored: entries.filter((entry) => !whole(entry)),
	};
}

/** Whether sign-up is limited to a list at all. */
export function signUpIsClosed(setting: string | undefined): boolean {
	return parseAllowList(setting).closed;
}

/** Whether this address may make an account under the setting. */
export function mayMakeAccount(setting: string | undefined, email: string): boolean {
	const list = parseAllowList(setting);
	if (!list.closed) return true;
	return list.addresses.includes(email.trim().toLowerCase());
}
