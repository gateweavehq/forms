import { env } from "cloudflare:workers";
import { codebookCsv, detachedCsv, responsesCsv } from "@gateweave/forms-results";
import { z } from "zod";
import { type CurrentUser, currentUser, db } from "./auth";
import { readCapped, TooLarge } from "./body";
import {
	addExamples,
	createForm,
	deleteAllResponses,
	deleteResponse,
	NotFound,
	ownedForm,
	preview,
	Refused,
	replaceDefinition,
	setState,
} from "./owner";
import { loadDetached, loadRecords, versionOf } from "./results";

/**
 * The most bytes an owner may send. A Tally form's page data runs to a megabyte or two, which
 * is far more than a respondent's request may be, and only someone signed in gets this far.
 */
const MAX_BODY = 4_000_000;

const previewBody = z.strictObject({
	kind: z.enum(["definition", "tally"]),
	text: z.string(),
	acceptDifferences: z.boolean().optional(),
	detachEmail: z.boolean().optional(),
	id: z.string().max(64).optional(),
});
const definitionBody = z.strictObject({ definition: z.unknown() });
const stateBody = z.strictObject({ state: z.enum(["draft", "open", "closed"]) });

function json(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * A CSV file to save. A form's id is lowercase letters, digits, `-` and `_`, so the name needs
 * no quoting. It is never kept by anything between the server and the person.
 */
function csv(name: string, text: string): Response {
	return new Response(text, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${name}.csv"`,
			"Cache-Control": "no-store",
		},
	});
}

/** The version an export is asked for, as `?v=`. */
function versionAsked(request: Request): string | undefined {
	return new URL(request.url).searchParams.get("v") ?? undefined;
}

/** The one answer for a form that is missing, someone else's, or asked for without a session. */
export function notFound(): Response {
	return json({ error: "Not found." }, 404);
}

/**
 * Whether a request that changes something came from one of this app's own pages. The session
 * cookie is `SameSite=Lax`, which keeps it off the POSTs other sites start in current browsers;
 * the `Origin` header is asked as well, so that an account's forms do not rest on that default.
 */
function fromOwnPage(request: Request): boolean {
	const own = env.BETTER_AUTH_URL
		? new URL(env.BETTER_AUTH_URL).origin
		: new URL(request.url).origin;
	return request.headers.get("Origin") === own;
}

async function read<Shape>(request: Request, schema: z.ZodType<Shape>): Promise<Shape> {
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
		throw new Refused(415, "Send JSON.");
	}
	let text: string;
	try {
		text = await readCapped(request, MAX_BODY);
	} catch (error) {
		if (error instanceof TooLarge) throw new Refused(413, "This is larger than a form can be.");
		throw error;
	}
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Refused(400, "This is not JSON.");
	}
	const parsed = schema.safeParse(data);
	if (!parsed.success) throw new Refused(400, "This is not what this address takes.");
	return parsed.data;
}

/** What a route gets: who is asking, the request, and the parts of the path it matched. */
type Handler = (user: CurrentUser, request: Request, parts: string[]) => Promise<Response>;

/**
 * The owner's addresses, each as a method and a path under `/api/owner/`. `:` stands for one
 * segment. Every handler that names a form begins with `ownedForm`.
 */
const routes: Array<[method: string, path: string, handler: Handler]> = [
	["POST", "preview", async (_user, request) => json(preview(await read(request, previewBody)))],
	[
		"POST",
		"forms",
		async (user, request) => {
			const { definition } = await read(request, definitionBody);
			return json(await createForm(db, user, definition), 201);
		},
	],
	["POST", "examples", async (user) => json({ added: await addExamples(db, user) })],
	[
		"POST",
		"forms/:/definition",
		async (user, request, [formId = ""]) => {
			const row = await ownedForm(db, user, formId);
			const { definition } = await read(request, definitionBody);
			await replaceDefinition(db, row, definition);
			return json({ replaced: true });
		},
	],
	[
		"POST",
		"forms/:/state",
		async (user, request, [formId = ""]) => {
			const row = await ownedForm(db, user, formId);
			const { state } = await read(request, stateBody);
			await setState(db, row, state);
			return json({ state });
		},
	],
	[
		"GET",
		"forms/:/export/responses.csv",
		async (user, request, [formId = ""]) => {
			const row = await ownedForm(db, user, formId);
			const { hash, definition } = await versionOf(db, row, versionAsked(request));
			const records = await loadRecords(db, row, hash);
			return csv(`${row.id}-responses-${hash.slice(0, 8)}`, responsesCsv(definition, records));
		},
	],
	[
		"GET",
		"forms/:/export/codebook.csv",
		async (user, request, [formId = ""]) => {
			const row = await ownedForm(db, user, formId);
			const { hash, definition } = await versionOf(db, row, versionAsked(request));
			return csv(`${row.id}-codebook-${hash.slice(0, 8)}`, codebookCsv(definition));
		},
	],
	[
		"GET",
		"forms/:/export/detached.csv",
		async (user, _request, [formId = ""]) => {
			const row = await ownedForm(db, user, formId);
			const { questions, rows } = await loadDetached(db, row);
			return csv(`${row.id}-kept-apart`, detachedCsv(questions, rows));
		},
	],
	[
		"DELETE",
		"forms/:/responses",
		async (user, _request, [formId = ""]) => {
			const row = await ownedForm(db, user, formId);
			await deleteAllResponses(db, row);
			return json({ deleted: true });
		},
	],
	[
		"DELETE",
		"forms/:/responses/:",
		async (user, _request, [formId = "", responseId = ""]) => {
			const row = await ownedForm(db, user, formId);
			if (!(await deleteResponse(db, row, responseId))) throw new NotFound();
			return json({ deleted: true });
		},
	],
];

/** Adds a route. The exports register theirs from their own module. */
export function route(method: string, path: string, handler: Handler): void {
	routes.push([method, path, handler]);
}

/** The segments a path matched against a pattern's `:`, or nothing when it does not match. */
function match(pattern: string, path: string): string[] | undefined {
	const wanted = pattern.split("/");
	const given = path.split("/");
	if (wanted.length !== given.length) return undefined;
	const parts: string[] = [];
	for (const [index, segment] of wanted.entries()) {
		const value = given[index] ?? "";
		if (segment === ":") parts.push(decodeURIComponent(value));
		else if (segment !== value) return undefined;
	}
	return parts;
}

/**
 * Everything under `/api/owner/`. Nobody signed in, an unknown address and someone else's form
 * all get the same "not found": the owner's side does not say what exists.
 */
export async function handleOwner(request: Request, path: string): Promise<Response> {
	try {
		const user = await currentUser(request.headers);
		if (!user) return notFound();
		if (request.method !== "GET" && !fromOwnPage(request)) return notFound();
		for (const [method, pattern, handler] of routes) {
			const parts = method === request.method ? match(pattern, path) : undefined;
			if (parts) return await handler(user, request, parts);
		}
		return notFound();
	} catch (error) {
		if (error instanceof NotFound) return notFound();
		if (error instanceof Refused) {
			return json({ error: error.message, problems: error.problems }, error.status);
		}
		console.error(`owner: ${error instanceof Error ? error.name : "failure"}`);
		return json({ error: "Something went wrong on our side." }, 500);
	}
}
