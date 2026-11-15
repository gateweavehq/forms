import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { convertV4MiniflareOptions, Miniflare, type V4ModuleDefinition } from "miniflare";

const app = resolve(import.meta.dirname, "..");
const serverDir = join(app, "dist/server");

interface BuiltConfig {
	compatibility_date: string;
	compatibility_flags?: string[];
}

/** One line the Worker wrote to its console. */
export interface WorkerLog {
	level: string;
	message: string;
}

/** Every module of the built Worker. */
function builtModules(): V4ModuleDefinition[] {
	const modules: V4ModuleDefinition[] = [];
	for (const file of readdirSync(serverDir, { recursive: true, encoding: "utf8" })) {
		if (file.endsWith(".js")) modules.push({ type: "ESModule", path: join(serverDir, file) });
	}
	return modules;
}

/**
 * The built Worker in workerd, as deployed, with its D1 database migrated and no network: every
 * outbound request fails, and Forms makes none. Requests go in through `fetch`.
 */
export async function startForms({
	origin = "https://forms.test",
	startsPerMinute = 10_000,
	detachedPerMinute = 10_000,
}: {
	origin?: string;
	/** The ceilings on the two open addresses. High unless a test is about them. */
	startsPerMinute?: number;
	detachedPerMinute?: number;
} = {}) {
	const config = JSON.parse(readFileSync(join(serverDir, "wrangler.json"), "utf8")) as BuiltConfig;
	const logs: WorkerLog[] = [];
	const outbound: string[] = [];
	// Miniflare 5 still takes its documented v4 options through this converter.
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			handleStructuredLogs: (log) => {
				logs.push(log);
			},
			workers: [
				{
					name: "forms",
					modules: builtModules(),
					modulesRoot: serverDir,
					compatibilityDate: config.compatibility_date,
					compatibilityFlags: config.compatibility_flags,
					d1Databases: { DB: "forms-test" },
					ratelimits: {
						START_LIMIT: { namespace_id: "1", simple: { limit: startsPerMinute, period: 60 } },
						DETACHED_LIMIT: {
							namespace_id: "2",
							simple: { limit: detachedPerMinute, period: 60 },
						},
					},
					outboundService: (request: Request) => {
						outbound.push(request.url);
						return new Response("Outbound requests are blocked in this test", { status: 502 });
					},
				},
			],
		}),
	);

	const db = await mf.getD1Database("DB");
	const migrations = join(app, "migrations");
	for (const file of readdirSync(migrations)
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		const statements = readFileSync(join(migrations, file), "utf8")
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);
		await db.batch(statements.map((statement) => db.prepare(statement)));
	}

	return {
		/** A request to the Worker. Redirects are returned, not followed. */
		async fetch(path: string, init: RequestInit = {}): Promise<Response> {
			const response = await mf.dispatchFetch(new URL(path, origin), {
				method: init.method,
				headers: [...new Headers(init.headers)],
				body: init.body as string | undefined,
				redirect: "manual",
			});
			return new Response(await response.arrayBuffer(), {
				status: response.status,
				headers: [...response.headers],
			});
		},
		/** The D1 database, for looking at what was stored. */
		db,
		/** Everything the Worker has logged so far, oldest first. */
		logs,
		/** URLs the Worker tried to fetch from outside. */
		outbound,
		dispose: () => mf.dispose(),
	};
}

export type Forms = Awaited<ReturnType<typeof startForms>>;
