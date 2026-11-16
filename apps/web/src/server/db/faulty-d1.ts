import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

// For tests: a real local D1, and a way to put a failure in front of it.

/** What the local runtime's D1 answered a read with under load, in Gateweave Agents' tests. */
export const LOCAL =
	"D1_ERROR: Failed to get session commit token: internal error; reference = test";

/**
 * A local D1 with the app's migrations applied, or without them, as a deployment's is before its
 * first migration. With `before`, only the migrations that come before that file are applied,
 * as on a deployment that has not had it yet, and `migrateRest` applies it and those after it.
 * Dispose of it after the tests.
 */
export async function migratedD1(
	name: string,
	{ migrate = true, before }: { migrate?: boolean; before?: string } = {},
) {
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			modules: true,
			script: "export default { fetch: () => new Response() };",
			d1Databases: { DB: name },
		}),
	);
	const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
	const migrations = resolve(import.meta.dirname, "../../../migrations");
	const files = migrate
		? readdirSync(migrations)
				.filter((each) => each.endsWith(".sql"))
				.sort()
		: [];
	const apply = async (some: string[]) => {
		for (const file of some) {
			const statements = readFileSync(join(migrations, file), "utf8")
				.split("--> statement-breakpoint")
				.map((statement) => statement.trim())
				.filter(Boolean);
			await d1.batch(statements.map((statement) => d1.prepare(statement)));
		}
	};
	const held = before === undefined ? [] : files.filter((file) => file >= before);
	await apply(files.filter((file) => !held.includes(file)));
	return { d1, dispose: () => mf.dispose(), migrateRest: () => apply(held) };
}

/**
 * The database, failing when told to: the next `failures` statements sent alone are refused with
 * `message`, before they reach the database, and so are the next `batchFailures` batches, which
 * is how most of what Forms writes is sent. The next `batchLosses` batches fail the other way:
 * they reach the database, which commits them, and then fail with `message`, as when the reply
 * is lost on its way back. `sent` lists every statement that was tried alone, refused or not,
 * and `batches` every batch, by its statements. `beforeBatch` runs once, before the next batch
 * reaches the database: the other request that got there first. A session it opens fails the
 * same way.
 */
export function faulty(d1: D1Database) {
	const state = {
		failures: 0,
		batchFailures: 0,
		batchLosses: 0,
		message: LOCAL,
		sent: [] as string[],
		batches: [] as string[][],
		beforeBatch: undefined as (() => Promise<void>) | undefined,
	};
	const sends = new Set<PropertyKey>(["all", "raw", "first", "run"]);
	const made = new WeakMap<object, D1PreparedStatement>();
	const texts = new WeakMap<object, string>();

	function watched(statement: D1PreparedStatement, query: string): D1PreparedStatement {
		const proxy = new Proxy(statement, {
			get(target, key) {
				const value: unknown = Reflect.get(target, key, target);
				if (typeof value !== "function") return value;
				if (key === "bind") {
					return (...values: unknown[]) => watched(target.bind(...values), query);
				}
				if (!sends.has(key)) return value.bind(target);
				return async (...args: unknown[]) => {
					state.sent.push(query);
					if (state.failures > 0) {
						state.failures -= 1;
						throw new Error(state.message);
					}
					return Reflect.apply(value, target, args);
				};
			},
		});
		made.set(proxy, statement);
		texts.set(proxy, query);
		return proxy;
	}

	function wrapped<Source extends D1Database | D1DatabaseSession>(source: Source): Source {
		return new Proxy(source, {
			get(target, key) {
				const value: unknown = Reflect.get(target, key, target);
				if (typeof value !== "function") return value;
				if (key === "prepare") return (query: string) => watched(target.prepare(query), query);
				if (key === "batch") {
					return async (statements: D1PreparedStatement[]) => {
						state.batches.push(statements.map((statement) => texts.get(statement) ?? ""));
						if (state.batchFailures > 0) {
							state.batchFailures -= 1;
							throw new Error(state.message);
						}
						const first = state.beforeBatch;
						state.beforeBatch = undefined;
						await first?.();
						const done = await target.batch(
							statements.map((statement) => made.get(statement) ?? statement),
						);
						if (state.batchLosses > 0) {
							state.batchLosses -= 1;
							throw new Error(state.message);
						}
						return done;
					};
				}
				if (key === "withSession") {
					return (...args: unknown[]) =>
						wrapped(Reflect.apply(value, target, args) as D1DatabaseSession);
				}
				return value.bind(target);
			},
		});
	}

	return { database: wrapped(d1), state };
}
