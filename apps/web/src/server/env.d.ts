// Optional configuration. Required secrets are declared under `secrets.required` in
// wrangler.jsonc, which is what `wrangler types` generates the rest of `Cloudflare.Env` from.
declare namespace Cloudflare {
	interface Env {
		/** Public URL of the app. Inferred from the request when unset. */
		BETTER_AUTH_URL?: string;
		/**
		 * Who may make an account: addresses and `@domains`, separated by commas. Anyone when
		 * unset. See src/lib/sign-up-allow.ts.
		 */
		SIGN_UP_ALLOW?: string;
		/**
		 * `"1"` serves the made-up forms in `examples/` from their files and lets a signed-in
		 * person add them to their account. Set in local development and in the tests' build,
		 * never on a deployment.
		 */
		FORMS_EXAMPLES?: string;
	}
}
