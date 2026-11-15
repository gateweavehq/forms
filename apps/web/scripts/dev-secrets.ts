/**
 * Settings Forms runs without (see src/server/env.d.ts). `secrets.required` in wrangler.jsonc
 * stops a deploy that lacks BETTER_AUTH_SECRET, but in local dev it also drops every other key
 * from .dev.vars. So in dev, these are added to the list when .dev.vars sets them.
 */
export const OPTIONAL_SETTINGS = ["BETTER_AUTH_URL", "SIGN_UP_ALLOW"] as const;

/** What local dev loads from .dev.vars: the required secrets, and the optional ones it sets. */
export function devSecrets(required: readonly string[], set: ReadonlySet<string>): string[] {
	return [...required, ...OPTIONAL_SETTINGS.filter((key) => set.has(key))];
}
