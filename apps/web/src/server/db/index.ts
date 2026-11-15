import { drizzle } from "drizzle-orm/d1";
import type { Statement } from "../statements";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
export { schema };

/** Runs statements as one batch: together or not at all. Returns how many rows each changed. */
export async function runBatch(d1: D1Database, statements: Statement[]): Promise<number[]> {
	const results = await d1.batch(
		statements.map(({ sql, params }) => d1.prepare(sql).bind(...params)),
	);
	return results.map((result) => result.meta.changes ?? 0);
}
