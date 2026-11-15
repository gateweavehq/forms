import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/**
 * A form's definition as it was when someone started a response on it, under a hash of its
 * content. A form changes: questions are reworded, options added, ids removed. Answers only
 * mean something against the definition they were given to, so each one in use is kept, once,
 * and a response is checked against its own for as long as it is open.
 */
export const definition = sqliteTable(
	"definition",
	{
		/** SHA-256 of the definition's JSON, in hex. */
		hash: text("hash").primaryKey(),
		formId: text("form_id").notNull(),
		/** The definition, as JSON. */
		json: text("json").notNull(),
		/**
		 * How many responses to this definition were taken back by the people who gave them.
		 * A number and nothing else: which response, and when, is what withdrawing removes. It
		 * goes up in the statement batch that deletes the response.
		 */
		withdrawn: integer("withdrawn").notNull().default(0),
	},
	(table) => [index("definition_form_idx").on(table.formId)],
);

/**
 * A form someone brought in. Its id is what its address carries (`/f/<id>`) and what
 * `response.form_id` and `definition.form_id` hold, so it never changes; its wording does, by
 * pointing at a newer definition.
 */
export const form = sqliteTable(
	"form",
	{
		id: text("id").primaryKey(),
		/** The one account that may see its results. Teams and sharing are not built. */
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		/** `draft`: not answerable yet. `open`: takes responses. `closed`: takes no new ones. */
		state: text("state", { enum: ["draft", "open", "closed"] }).notNull(),
		/** The definition a new response starts under. */
		definitionHash: text("definition_hash")
			.notNull()
			.references(() => definition.hash),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("form_owner_idx").on(table.ownerId)],
);

/**
 * One person's pass through one form. It exists from the moment they agree to take part, so
 * that every answer has somewhere to go as it is given.
 *
 * Nothing here says who the person is: no name, no network address, no user agent. `device` is
 * the rough size of the screen they started on, which is what a study needs to compare phones
 * with desks.
 */
export const response = sqliteTable(
	"response",
	{
		/** Random, and in the response's address. */
		id: text("id").primaryKey(),
		formId: text("form_id").notNull(),
		/** The definition the answers are given to: the one the form had at the start. */
		definitionHash: text("definition_hash")
			.notNull()
			.references(() => definition.hash),
		/** The version of the answers' shape (`ANSWERS_VERSION`) this response's rows are in. */
		answersVersion: integer("answers_version").notNull(),
		/**
		 * What proves the secret without being it (see `server/secret.ts`). The secret itself is
		 * only in the person's address bar.
		 */
		secretSeal: text("secret_seal").notNull(),
		device: text("device", { enum: ["phone", "tablet", "desk"] }).notNull(),
		/** The step the person is on, as the flow names it. Where another device continues. */
		position: text("position"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		completedAt: integer("completed_at"),
	},
	(table) => [index("response_form_idx").on(table.formId)],
);

/** One answer of a response, written when it is given and again when it is changed. */
export const answer = sqliteTable(
	"answer",
	{
		responseId: text("response_id")
			.notNull()
			.references(() => response.id, { onDelete: "cascade" }),
		questionId: text("question_id").notNull(),
		/** The item the answer is about, for a block's question. Empty otherwise. */
		itemId: text("item_id").notNull().default(""),
		/** The value as JSON, or null when the question was shown and left without an answer. */
		value: text("value"),
		/** Milliseconds the question was on screen in a visible tab, over every visit. */
		activeMs: integer("active_ms").notNull().default(0),
		/** How often an answer already given was replaced by a different one. */
		changes: integer("changes").notNull().default(0),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.responseId, table.questionId, table.itemId] }),
		// The primary key finds one response's answers. Results are read the other way: every
		// response's answer to one question, for one item.
		index("answer_question_idx").on(table.questionId, table.itemId),
	],
);

/**
 * The answers a form keeps apart, such as an email address for the results. A row has no
 * response id and no time, and its key is a random number, not the next one: SQLite numbers
 * rows in the order they arrive otherwise, and that order alone would pair each row with the
 * response completed just before it.
 */
export const detachedAnswer = sqliteTable(
	"detached_answer",
	{
		id: integer("id").primaryKey(),
		formId: text("form_id").notNull(),
		/** The answers as JSON, keyed by question id. */
		answers: text("answers").notNull(),
	},
	(table) => [index("detached_answer_form_idx").on(table.formId)],
);
