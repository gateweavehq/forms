import type { Forms } from "./forms-worker";

/** The origin the test Worker says it is at, which Better Auth checks a request's Origin against. */
export const ORIGIN = "https://forms.test";

let people = 0;

/** A made-up person who has never been used by another test. */
export function newPerson(label = "owner") {
	people++;
	const id = `${label}-${people}-${Math.random().toString(36).slice(2, 8)}`;
	return { name: `Test ${id}`, email: `${id}@example.test`, password: "correct-horse-battery" };
}

export type Person = ReturnType<typeof newPerson>;

/** The session cookies a response set, as a `Cookie` header. */
export function cookiesOf(response: Response): string {
	return response.headers
		.getSetCookie()
		.map((cookie) => cookie.split(";")[0])
		.join("; ");
}

export function authPost(
	forms: Forms,
	path: string,
	body: unknown,
	cookie = "",
): Promise<Response> {
	return forms.fetch(`/api/auth${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: ORIGIN,
			...(cookie ? { Cookie: cookie } : {}),
		},
		body: JSON.stringify(body),
	});
}

/** Makes an account and returns its session cookie. */
export async function signUp(forms: Forms, person: Person = newPerson()): Promise<string> {
	const response = await authPost(forms, "/sign-up/email", person);
	if (response.status !== 200) throw new Error(`Sign-up failed: ${response.status}`);
	return cookiesOf(response);
}

/** A request as a signed-in person's browser would send it from one of the app's own pages. */
export function as(cookie: string, init: RequestInit = {}): RequestInit {
	return {
		...init,
		headers: {
			...(init.body ? { "Content-Type": "application/json" } : {}),
			Origin: ORIGIN,
			...(cookie ? { Cookie: cookie } : {}),
			...(init.headers as Record<string, string> | undefined),
		},
	};
}
