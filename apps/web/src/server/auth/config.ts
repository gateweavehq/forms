import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { Database } from "../db";
import { schema } from "../db";

export interface AuthConfig {
	db: Database;
	secret: string;
	baseURL?: string | undefined;
	/**
	 * Marks cookies `Secure` whatever the base URL says. Without a pinned `baseURL`, Better Auth
	 * decides from NODE_ENV, which a Worker never has, and leaves the attribute off.
	 */
	secureCookies?: boolean | undefined;
	/** Whether this address may make an account (the `SIGN_UP_ALLOW` setting). Anyone without it. */
	mayMakeAccount?: ((email: string) => boolean) | undefined;
	/**
	 * Whether one more try at signing in or signing up with this address is within the limit.
	 * Unlimited without it.
	 */
	allowTry?: ((key: string) => Promise<boolean>) | undefined;
}

export const SIGN_UP_CLOSED =
	"This server takes new accounts from a list, and this address is not on it.";
export const TOO_MANY_TRIES = "Too many tries with this address. Wait a minute and try again.";

/**
 * Builds the Better Auth instance: email and password, and nothing else yet. Kept free of
 * `cloudflare:workers` imports so the Better Auth CLI can load it to generate the schema.
 *
 * Accounts are for the people who run forms. A respondent never has one, and nothing under
 * `/f/` or the respondent's API reads a session.
 *
 * Signing in through Gateweave ID (OpenID Connect) belongs here as one more plugin, later.
 */
export function createAuth(config: AuthConfig) {
	return betterAuth({
		secret: config.secret,
		baseURL: config.baseURL,
		database: drizzleAdapter(config.db, { provider: "sqlite", schema }),
		telemetry: { enabled: false },
		advanced: {
			// Each query is a trip to the database's one primary. This reads a session and its
			// person in one.
			database: { joins: true },
			// Forms reads nobody's network address, an account holder's included. This also turns
			// Better Auth's own limiter off, which counts by address; `allowTry` stands in for it.
			ipAddress: { disableIpTracking: true },
			// Only the attribute: `useSecureCookies` would also rename the cookies.
			...(config.secureCookies && { defaultCookieAttributes: { secure: true } }),
		},
		emailAndPassword: { enabled: true },
		databaseHooks: {
			session: {
				create: {
					// A session row has columns for the address and the browser it came from. Forms
					// keeps neither, of anyone.
					before: async (session) => ({
						data: { ...session, ipAddress: null, userAgent: null },
					}),
				},
			},
			user: {
				create: {
					// Every way an account is made comes through here.
					before: async (user) => {
						if (config.mayMakeAccount && !config.mayMakeAccount(user.email)) {
							throw APIError.from("FORBIDDEN", { message: SIGN_UP_CLOSED, code: "SIGN_UP_CLOSED" });
						}
						// The sign-up form sends no picture, and one would be fetched from wherever
						// its address points by everyone who sees it.
						return { data: { ...user, image: null } };
					},
				},
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-up/email") return;
				const email: unknown = ctx.body?.email;
				if (typeof email !== "string") return;
				const address = email.trim().toLowerCase();
				// Before Better Auth looks the address up, which on a closed server would tell
				// which addresses have an account.
				if (
					ctx.path === "/sign-up/email" &&
					config.mayMakeAccount &&
					!config.mayMakeAccount(address)
				) {
					throw APIError.from("FORBIDDEN", { message: SIGN_UP_CLOSED, code: "SIGN_UP_CLOSED" });
				}
				// Counted per address tried, not per sender: guessing at one account's password
				// is what this stops. A sender trying many addresses is for the edge to stop.
				if (config.allowTry && !(await config.allowTry(`${ctx.path} ${address}`))) {
					throw APIError.from("TOO_MANY_REQUESTS", {
						message: TOO_MANY_TRIES,
						code: "TOO_MANY_TRIES",
					});
				}
			}),
		},
		disabledPaths: [
			// Offered to any session, and no page uses them. A cookie may be stolen.
			"/unlink-account",
			"/verify-password",
			"/get-access-token",
			"/refresh-token",
			"/account-info",
			"/list-accounts",
			"/list-sessions",
			"/link-social",
			// No email is sent yet, so nothing can prove an address or reset a password.
			"/request-password-reset",
			"/reset-password",
			"/send-verification-email",
			"/change-email",
			"/delete-user",
		],
		plugins: [
			// Must stay last: forwards Set-Cookie headers from server-side auth calls.
			tanstackStartCookies(),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;
