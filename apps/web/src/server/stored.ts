import { getTableColumns } from "drizzle-orm";
import { answer, detachedAnswer, response } from "./db/schema";

/**
 * How long D1 keeps its own history (Time Travel), in days: 30 on the Workers Paid plan, which
 * is the longest, and 7 on the free one. A deleted row can be brought back from it for that
 * long by whoever runs the deployment, so every page that deletes says "up to" this.
 */
export const HISTORY_DAYS = 30;

/**
 * Every column of the tables that hold what a respondent gives, by the names the schema gives
 * them. The page that tells a respondent what is stored is built from this list, and shows a
 * line for each entry: a column added to one of these tables appears on that page, described
 * or not, and `test/stored.test.ts` fails until it is described.
 *
 * The other tables hold nothing a respondent gives: a form, its definitions, and the accounts
 * of the people who run forms.
 */
export function storedColumns() {
	return {
		response: Object.keys(getTableColumns(response)),
		answer: Object.keys(getTableColumns(answer)),
		detachedAnswer: Object.keys(getTableColumns(detachedAnswer)),
	};
}

export type StoredColumns = ReturnType<typeof storedColumns>;
