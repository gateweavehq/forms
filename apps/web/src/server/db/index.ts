import { drizzle } from "drizzle-orm/d1";
import type { Statement } from "../statements";
import { handWritten, withoutStatements } from "./query-failure";
import { retryingReads } from "./retry-reads";
import * as schema from "./schema";

/**
 * The database every part of the Worker asks: the respondent's API, the owner's API and pages,
 * the exports and Better Auth. A read that fails for a moment is sent again (`retry-reads.ts`),
 * and a query that failed for good is thrown without its statement or its values
 * (`query-failure.ts`).
 */
export function createDb(d1: D1Database) {
	const db = drizzle(retryingReads(d1), { schema });
	// A deployment without a database serves nothing (`notSetUp` in server.ts), and has to start
	// to say so: there is no query to fail, and no binding for `withoutStatements` to find.
	return d1 ? withoutStatements(db) : db;
}

export type Database = ReturnType<typeof createDb>;
export { schema };

// The two ways a statement written by hand is sent. They are the only code that reaches for the
// D1 binding under Drizzle (`$client`), so that a failure of theirs is thrown and logged like
// any other query's, and a read of theirs is sent again like any other read:
// `db/hand-written.test.ts` fails when another file reaches for it.

/**
 * Runs statements as one batch: together or not at all. Returns how many rows each changed. A
 * batch is sent once, whatever fails: it holds writes.
 */
export async function runBatch(db: Database, statements: Statement[]): Promise<number[]> {
	const d1 = db.$client;
	const results = await handWritten(
		statements.map(({ sql }) => sql),
		() => d1.batch(statements.map(({ sql, params }) => d1.prepare(sql).bind(...params))),
	);
	return results.map((result) => result.meta.changes ?? 0);
}

/** The rows a `SELECT` written by hand gives. */
export async function readRows<Row>(db: Database, { sql, params }: Statement): Promise<Row[]> {
	const { results } = await handWritten([sql], () =>
		db.$client
			.prepare(sql)
			.bind(...params)
			.all<Row>(),
	);
	return results;
}
