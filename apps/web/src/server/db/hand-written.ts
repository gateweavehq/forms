import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Statement } from "../statements";
import * as schema from "./schema";

/**
 * A statement written by hand, refused before it is sent when its text could hold a value.
 *
 * What a failed query logs is its statement's text, on the promise that the text is the code's
 * own words (`query-failure.ts`). Drizzle keeps that promise by binding what it is given. A
 * statement written by hand is a string, and a string can be put together from anything:
 * `WHERE response_id = '${id}'` works, and would log the id. So the text is read here, by
 * `runBatch` and `readRows`, which are the only way such a statement is sent, and one that
 * does not pass is thrown back at whoever wrote it, in every test that runs it and before the
 * database or a log sees it.
 *
 * A text passes when all of it is one of these:
 *
 * - a placeholder, `?1` to `?n`, where `n` is the number of values bound and none is left out;
 * - a word that SQL or the schema gives: a keyword in `WORDS`, or the name of a table or a
 *   column;
 * - `0` or `1`, which the statements count and compare with; any other number is bound
 *   (`LIMIT ?6`);
 * - a quoted state of a form (`'open'`), the one thing the statements quote;
 * - spaces and `( ) , . = < > + *`.
 *
 * What this cannot see is a value that is itself one of those: a `0`, a `1`, the word `open`
 * in quotes, or an id that happens to be a column's name. Such a text holds nothing the schema
 * and this file do not already say.
 */

/** The SQL the statements are written in. A statement that needs another word adds it here. */
const WORDS = new Set(
	`select from where and or not exists in is null insert into values on conflict do nothing
	update set delete case when then else end coalesce excluded join order by limit count`
		.split(/\s+/)
		.filter(Boolean),
);

/** Every table and column of the schema, by the names the database has for them. */
const NAMES = new Set(
	Object.values(schema).flatMap((value: unknown) => {
		if (!is(value, SQLiteTable)) return [];
		const { name, columns } = getTableConfig(value);
		return [name, ...columns.map((column) => column.name)];
	}),
);

/** What a form's state can be, quoted as the statements quote it. */
const STATES = new Set(schema.form.state.enumValues.map((state) => `'${state}'`));

/** Why a statement is refused. Never with its text, which is what may hold a value. */
export class ValueInText extends Error {
	constructor(why: string) {
		super(`A statement written by hand was not sent: ${why}. Bind the value as a ?n.`);
		this.name = "ValueInText";
	}
}

/** Throws unless the statement's text is placeholders, SQL and the schema's names alone. */
export function refuseValues({ sql, params }: Statement): void {
	const quoted = sql.match(/'[^']*'?/g) ?? [];
	if (quoted.some((literal) => !STATES.has(literal))) {
		throw new ValueInText("its text holds a quoted literal");
	}
	const bare = sql.replace(/'[^']*'/g, " ");
	if (/[^\w\s?(),.=<>+*]/.test(bare)) {
		throw new ValueInText("its text holds a character no statement is written with");
	}
	const places = [...bare.matchAll(/\?(\d*)/g)].map((found) => found[1] ?? "");
	const numbers = new Set(places.map(Number));
	const complete =
		places.every((place) => place !== "" && !place.startsWith("0")) &&
		numbers.size === params.length &&
		params.every((_, index) => numbers.has(index + 1));
	if (!complete) {
		throw new ValueInText("its placeholders are not ?1 to ?n for the n values it binds");
	}
	for (const [word] of bare.replace(/\?\d+/g, " ").matchAll(/\w+/g)) {
		if (/^\d/.test(word)) {
			if (word !== "0" && word !== "1") throw new ValueInText("its text holds a number");
		} else if (!WORDS.has(word.toLowerCase()) && !NAMES.has(word)) {
			throw new ValueInText("its text holds a word that is neither SQL's nor the schema's");
		}
	}
}
