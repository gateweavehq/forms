/**
 * Who may make an account, from the `SIGN_UP_ALLOW` setting: addresses and `@domains`, separated
 * by commas or spaces. A domain covers addresses at exactly that domain, not its subdomains.
 * Unset or empty, anyone may sign up, which is right for a server someone runs for themselves
 * and wrong for one on the open internet.
 */
export function parseAllowList(setting: string | undefined): string[] {
	return (setting ?? "")
		.split(/[\s,]+/)
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
}

/** Whether sign-up is limited to a list at all. */
export function signUpIsClosed(setting: string | undefined): boolean {
	return parseAllowList(setting).length > 0;
}

/** Whether this address may make an account under the setting. */
export function mayMakeAccount(setting: string | undefined, email: string): boolean {
	const allowed = parseAllowList(setting);
	if (allowed.length === 0) return true;
	const address = email.trim().toLowerCase();
	const domain = address.slice(address.lastIndexOf("@"));
	return allowed.some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
}
