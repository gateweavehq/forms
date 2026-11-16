import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Forms } from "./forms-worker";

const assets = join(resolve(import.meta.dirname, ".."), "dist/server/assets");

/** The address the build gave a server function, which is where the browser asks it. */
export function serverFnUrl(name: string): string {
	const resolver = readdirSync(assets).find((file) =>
		/^__23tanstack-start-server-fn-resolver-.*\.js$/.test(file),
	);
	const source = resolver ? readFileSync(join(assets, resolver), "utf8") : "";
	const id = new RegExp(
		`"([0-9a-f]{64})": \\{\\s*functionName: "${name}_createServerFn_handler"`,
	).exec(source)?.[1];
	if (!id) throw new Error(`No server function ${name} in the build`);
	return `/_serverFn/${id}`;
}

/** What a browser adds to a request one of the app's own pages makes. */
export const FROM_THE_APP = { "Sec-Fetch-Site": "same-origin" };

/**
 * Calls a GET server function with one string, or with nothing, as the browser does. `from` is
 * what says where the request comes from: `Sec-Fetch-Site`, `Origin` or `Referer`.
 */
export function serverFn(
	forms: Forms,
	name: string,
	cookie: string,
	data?: string,
	from: Record<string, string> = FROM_THE_APP,
): Promise<Response> {
	// Seroval's JSON for `{ data }`.
	const value = data === undefined ? { t: 2, s: 1 } : { t: 1, s: data };
	const payload = JSON.stringify({
		t: { t: 10, i: 0, p: { k: ["data"], v: [value] }, o: 0 },
		f: 0,
		m: [],
	});
	return forms.fetch(`${serverFnUrl(name)}?payload=${encodeURIComponent(payload)}`, {
		headers: { "x-tsr-serverFn": "true", accept: "application/json", Cookie: cookie, ...from },
	});
}
