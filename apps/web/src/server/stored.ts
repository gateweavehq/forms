import { getTableColumns, getTableName } from "drizzle-orm";
import { answer, detachedAnswer, response } from "./db/schema";

/**
 * How long D1 keeps its own history (Time Travel), in days: 30 on the Workers Paid plan, which
 * is the longest, and 7 on the free one. A deleted row can be brought back from it for that
 * long by whoever runs the deployment, so every page that deletes says "up to" this.
 */
export const HISTORY_DAYS = 30;

/** The tables that hold what a respondent gives, under the names the page knows them by. */
const RESPONDENT_TABLES = { response, answer, detachedAnswer };

/**
 * Every column of the tables that hold what a respondent gives, by the names the schema gives
 * them. The page that tells a respondent what is stored is built from this list, and shows a
 * line for each entry: a column added to one of these tables appears on that page, described
 * or not, and `test/stored.test.ts` fails until it is described.
 */
export function storedColumns() {
	return {
		response: Object.keys(getTableColumns(response)),
		answer: Object.keys(getTableColumns(answer)),
		detachedAnswer: Object.keys(getTableColumns(detachedAnswer)),
	};
}

export type StoredColumns = ReturnType<typeof storedColumns>;

/** The tables above as the database names them, each with the name the page uses for it. */
export function respondentTables(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(RESPONDENT_TABLES).map(([name, table]) => [getTableName(table), name]),
	);
}

/**
 * Every other table of the database, each with why it is not on the respondent's page. The
 * page says it names everything that is kept about someone who answers, so a table is either
 * on it or here with a reason: `test/stored.test.ts` reads the tables of the migrated database
 * and fails on one that is in neither place. A new table that holds anything a respondent
 * gives, or anything about them, belongs on the page.
 */
export const OTHER_TABLES: Record<string, string> = {
	form: "A form: its id, owner, title, state and current definition. Nothing of a respondent's.",
	definition:
		"A form's wording, and how many responses to it were taken back. The count is a number per version, with no response, no time and no person; the page says in words that it is kept.",
	retired_form_id:
		"The id of a deleted form and the account that had it. Nothing of a respondent's.",
	user: "An account of someone who runs forms. Respondents have none.",
	session: "A signed-in session of someone who runs forms.",
	account: "The password of someone who runs forms, hashed.",
	verification: "Better Auth's own table, for the accounts of people who run forms.",
	d1_migrations: "Wrangler's record of which migrations were applied.",
};
