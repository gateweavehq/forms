import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, ORIGIN, signUp } from "./accounts";
import { type Forms, startForms } from "./forms-worker";
import { plantForm } from "./made-up";
import { serverFn } from "./server-fn";

/**
 * A server function answers only a request that comes from the app's own pages. The framework
 * guards them by default, and stops as soon as an app has a start instance of its own
 * (`src/start.ts`), which Forms has: so the guard is listed there, and this is what fails if it
 * is ever left out. The owner's pages read through server functions with the session's cookie,
 * so a page of another site must not be able to ask them as the person signed in.
 *
 * The guard reads `Sec-Fetch-Site` when the request has one, and nothing else then. Without it,
 * `Origin`; without that, `Referer`. A request with none of the three is refused: every browser
 * sends at least one with a request a page makes.
 */

let forms: Forms;
let owner: string;

const FORM = "guarded-plants";
const ELSEWHERE = "https://elsewhere.example";

beforeAll(async () => {
	forms = await startForms();
	owner = await signUp(forms);
	const created = await forms.fetch(
		"/api/owner/forms",
		as(owner, { method: "POST", body: JSON.stringify({ definition: plantForm(FORM) }) }),
	);
	expect(created.status).toBe(201);
});
afterAll(() => forms.dispose());

/** The owner's form, asked for with their cookie from wherever `from` says. */
const ask = (from: Record<string, string>) => serverFn(forms, "getOwnedForm", owner, FORM, from);

/**
 * The same request while the table of sessions is out of reach, and how many queries the Worker
 * logged as failed. The function reads the session first, so one that ran has a failure to show.
 */
async function askWithoutSessions(from: Record<string, string>) {
	const logged = forms.logs.length;
	await forms.db.exec("ALTER TABLE session RENAME TO session_gone");
	try {
		const response = await ask(from);
		await response.arrayBuffer();
		const failures = forms.logs
			.slice(logged)
			.filter(({ message }) => message.includes("d1: a query failed"));
		return { status: response.status, failures: failures.length };
	} finally {
		await forms.db.exec("ALTER TABLE session_gone RENAME TO session");
	}
}

async function expectRefused(response: Response) {
	expect(response.status).toBe(403);
	const text = await response.text();
	expect(text).toBe("Forbidden");
	expect(text).not.toContain("Plants at home");
}

async function expectAnswered(response: Response) {
	expect(response.status).toBe(200);
	expect(await response.text()).toContain("Plants at home");
}

describe("a server function asked from the app's own pages", () => {
	it("answers a request the browser calls same-origin", async () => {
		await expectAnswered(await ask({ "Sec-Fetch-Site": "same-origin" }));
	});

	it("answers a request with the app's own Origin and no Sec-Fetch-Site", async () => {
		await expectAnswered(await ask({ Origin: ORIGIN }));
	});

	it("answers a request with only a Referer that is one of the app's pages", async () => {
		await expectAnswered(await ask({ Referer: `${ORIGIN}/forms/${FORM}` }));
	});
});

describe("a server function asked from somewhere else", () => {
	it("refuses a cross-site request that carries the owner's cookie, and does not run", async () => {
		await expectRefused(await ask({ "Sec-Fetch-Site": "cross-site" }));

		// The measure: from the app's own page the function runs, and its read of the session fails.
		const own = await askWithoutSessions({ "Sec-Fetch-Site": "same-origin" });
		expect(own.failures).toBe(1);

		const foreign = await askWithoutSessions({ "Sec-Fetch-Site": "cross-site" });
		expect(foreign).toEqual({ status: 403, failures: 0 });
	});

	it("refuses another site of the same registrable domain", async () => {
		await expectRefused(await ask({ "Sec-Fetch-Site": "same-site" }));
	});

	it("goes by Sec-Fetch-Site alone when there is one, whatever Origin says", async () => {
		await expectRefused(await ask({ "Sec-Fetch-Site": "cross-site", Origin: ORIGIN }));
	});

	it("refuses a foreign Origin with no Sec-Fetch-Site", async () => {
		await expectRefused(await ask({ Origin: ELSEWHERE }));
		expect(await askWithoutSessions({ Origin: ELSEWHERE })).toEqual({ status: 403, failures: 0 });
	});

	it("refuses a foreign Referer when that is all there is", async () => {
		await expectRefused(await ask({ Referer: `${ELSEWHERE}/page` }));
		// An address that only begins like the app's is another site's.
		await expectRefused(await ask({ Referer: `${ORIGIN}.elsewhere.example/page` }));
	});

	it("refuses a request that says nothing about where it comes from", async () => {
		await expectRefused(await ask({}));
	});
});
