import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, authPost, cookiesOf, newPerson, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";

let forms: Forms;

beforeAll(async () => {
	forms = await startForms();
});
afterAll(() => forms.dispose());

describe("an account", () => {
	it("is made with a name, an address and a password, and signs its maker in", async () => {
		const person = newPerson();
		const cookie = await signUp(forms, person);
		const page = await forms.fetch("/forms", as(cookie));
		expect(page.status).toBe(200);
		expect(await page.text()).toContain(person.email);
	});

	it("is signed in to with its password, and not with another", async () => {
		const person = newPerson();
		await signUp(forms, person);
		const wrong = await authPost(forms, "/sign-in/email", {
			email: person.email,
			password: "not-the-password",
		});
		expect(wrong.status).toBe(401);
		expect(cookiesOf(wrong)).toBe("");
		const right = await authPost(forms, "/sign-in/email", person);
		expect(right.status).toBe(200);
		expect((await forms.fetch("/forms", as(cookiesOf(right)))).status).toBe(200);
	});

	it("gets a cookie that scripts cannot read and that is sent over HTTPS only", async () => {
		const response = await authPost(forms, "/sign-up/email", newPerson());
		const [session] = response.headers
			.getSetCookie()
			.filter((cookie) => cookie.includes("session_token"));
		expect(session).toMatch(/HttpOnly/i);
		expect(session).toMatch(/Secure/i);
		expect(session).toMatch(/SameSite=Lax/i);
	});

	it("keeps nothing of where its sessions came from", async () => {
		const person = newPerson();
		const response = await forms.fetch("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "https://forms.test",
				"CF-Connecting-IP": "203.0.113.50",
				"X-Forwarded-For": "203.0.113.50",
				"User-Agent": "OwnerBrowser/1.0",
			},
			body: JSON.stringify(person),
		});
		expect(response.status).toBe(200);
		const { results } = await forms.db.prepare("SELECT * FROM session").all();
		const stored = JSON.stringify(results);
		expect(results.length).toBeGreaterThan(0);
		expect(stored).not.toContain("203.0.113.50");
		expect(stored).not.toContain("OwnerBrowser");
	});

	it("is signed out of, after which its pages ask to sign in", async () => {
		const cookie = await signUp(forms);
		const out = await authPost(forms, "/sign-out", {}, cookie);
		expect(out.status).toBe(200);
		const page = await forms.fetch("/forms", as(cookie));
		expect(page.status).toBe(307);
		expect(page.headers.get("Location")).toContain("/login");
	});

	it("is refused from another site's page", async () => {
		const response = await forms.fetch("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "https://evil.test" },
			body: JSON.stringify(newPerson()),
		});
		expect(response.status).toBe(403);
	});
});

describe("the pages of people who run forms", () => {
	it("send a visitor who is not signed in to the sign-in page, and back afterwards", async () => {
		for (const path of ["/forms", "/account"]) {
			const page = await forms.fetch(path);
			expect(page.status, path).toBe(307);
			expect(page.headers.get("Location")).toBe(`/login?redirect=${encodeURIComponent(path)}`);
		}
	});

	it("serve the sign-in page with its button waiting for the page's script", async () => {
		const page = await forms.fetch("/login");
		expect(page.status).toBe(200);
		expect(await page.text()).toMatch(/<button[^>]*disabled[^>]*>Sign in<\/button>/);
	});
});

describe("tries at an account", () => {
	it("are limited per address, whichever way they end", async () => {
		const limited = await startForms({ triesPerMinute: 3 });
		try {
			const person = newPerson();
			const other = newPerson();
			await signUp(limited, person);
			const guess = (email: string) =>
				authPost(limited, "/sign-in/email", { email, password: "a-wrong-guess" });
			// The sign-up was the first try with this address on its own path; these are sign-ins.
			const statuses: number[] = [];
			for (let tries = 0; tries < 5; tries++) statuses.push((await guess(person.email)).status);
			expect(statuses).toEqual([401, 401, 401, 429, 429]);
			// Even the right password waits, and the case of the address does not get around it.
			expect((await authPost(limited, "/sign-in/email", person)).status).toBe(429);
			expect((await guess(person.email.toUpperCase())).status).toBe(429);
			// Another address has tries of its own.
			expect((await guess(other.email)).status).toBe(401);
		} finally {
			await limited.dispose();
		}
	});
});

describe("a server that takes new accounts from a list", () => {
	it("makes accounts for the listed addresses and domains, and for nobody else", async () => {
		const closed = await startForms({
			settings: { SIGN_UP_ALLOW: "ada@example.test, @study.example" },
		});
		try {
			const make = (email: string) => authPost(closed, "/sign-up/email", { ...newPerson(), email });
			expect((await make("ada@example.test")).status).toBe(200);
			expect((await make("anyone@study.example")).status).toBe(200);
			const refused = await make("bob@example.test");
			expect(refused.status).toBe(403);
			expect(await refused.json()).toMatchObject({ code: "SIGN_UP_CLOSED" });
			const { results } = await closed.db.prepare("SELECT email FROM user").all();
			expect((results as Array<{ email: string }>).map((row) => row.email).sort()).toEqual([
				"ada@example.test",
				"anyone@study.example",
			]);
			expect(await (await closed.fetch("/login")).text()).toContain(
				"takes new accounts from a list",
			);
		} finally {
			await closed.dispose();
		}
	});
});

describe("a deployment without its secret", () => {
	it("serves nothing, and says why", async () => {
		const bare = await startForms({ settings: { BETTER_AUTH_SECRET: "" } });
		try {
			const page = await bare.fetch("/");
			expect(page.status).toBe(503);
			expect(await page.text()).toContain("BETTER_AUTH_SECRET");
		} finally {
			await bare.dispose();
		}
	});
});

describe("the respondent's side", () => {
	it("works the same with and without a session, and sets no cookie", async () => {
		const cookie = await signUp(forms);
		for (const init of [as(cookie), {}]) {
			const page = await forms.fetch("/f/home-baking", init);
			expect(page.status).toBe(200);
			expect(page.headers.getSetCookie()).toEqual([]);
			const started = await forms.fetch("/api/forms/home-baking/responses", {
				...init,
				method: "POST",
				headers: {
					...(init.headers as Record<string, string>),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ device: "desk", consent: true }),
			});
			expect(started.status).toBe(201);
			expect(started.headers.getSetCookie()).toEqual([]);
		}
	});
});
