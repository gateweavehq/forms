/**
 * The statements that have to ask again what the code around them already checked.
 *
 * A request reads a row, decides, and writes. Another request can change that row in between:
 * close the form, complete the response, delete the form. So each statement here carries the
 * condition it was decided under, and changes nothing when it no longer holds.
 *
 * They are kept apart from the code that decides, as plain SQL with its values, so that a test
 * can run them in the losing order (the other request first) against the migrated database,
 * which no pair of real requests can be made to do on purpose. Nothing here imports the
 * Worker's runtime.
 */

export interface Statement {
	sql: string;
	params: Array<string | number | null>;
}

/** A form that has a row and takes answers. An example served from its file has no row. */
const FORM_OPEN = "EXISTS (SELECT 1 FROM form WHERE id = ?2 AND state = 'open')";

/**
 * Starts a response to a form that has a row: its definition, kept once per content, and the
 * response. Both only while the form is still there and open. The last statement is the
 * response's; it changes no row when the form was closed or deleted since it was read.
 */
export function startStatements(start: {
	id: string;
	formId: string;
	hash: string;
	json: string;
	answersVersion: number;
	seal: string;
	device: string;
	now: number;
}): Statement[] {
	return [
		{
			sql: `INSERT INTO definition (hash, form_id, json) SELECT ?1, ?2, ?3 WHERE ${FORM_OPEN}
				ON CONFLICT (hash) DO NOTHING`,
			params: [start.hash, start.formId, start.json],
		},
		{
			sql: `INSERT INTO response
					(id, form_id, definition_hash, answers_version, secret_seal, device, created_at, updated_at)
				SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7 WHERE ${FORM_OPEN}`,
			params: [
				start.id,
				start.formId,
				start.hash,
				start.answersVersion,
				start.seal,
				start.device,
				start.now,
			],
		},
	];
}

/** Stores what a form with a row keeps apart, only while that form is still there and open. */
export function keepApartStatement(row: {
	id: number;
	formId: string;
	answers: string;
}): Statement {
	return {
		sql: `INSERT INTO detached_answer (id, form_id, answers) SELECT ?1, ?2, ?3 WHERE ${FORM_OPEN}`,
		params: [row.id, row.formId, row.answers],
	};
}

/**
 * Withdraws a response: the count on its definition, its answers, and the response, in that
 * order. `afterCompletion` is what the code decided from the form and the definition it read:
 * whether a complete response may go. Each statement asks again whether the response is still
 * unfinished or, for a complete one, whether its form is still not closed ("no form that is
 * not open", because an example served from its file has no row and is open). The last
 * statement is the response's; it changes no row when the answer has become no.
 */
export function withdrawStatements(withdrawal: {
	responseId: string;
	definitionHash: string;
	afterCompletion: boolean;
}): Statement[] {
	const allowed = `(completed_at IS NULL OR (?2 = 1 AND NOT EXISTS (
		SELECT 1 FROM form WHERE form.id = response.form_id AND form.state <> 'open')))`;
	const still = `EXISTS (SELECT 1 FROM response WHERE id = ?1 AND ${allowed})`;
	const may = withdrawal.afterCompletion ? 1 : 0;
	return [
		{
			sql: `UPDATE definition SET withdrawn = withdrawn + 1 WHERE hash = ?3 AND ${still}`,
			params: [withdrawal.responseId, may, withdrawal.definitionHash],
		},
		// Said, not left to the table's ON DELETE: what a person takes back must not depend on
		// a database setting being on.
		{
			sql: `DELETE FROM answer WHERE response_id = ?1 AND ${still}`,
			params: [withdrawal.responseId, may],
		},
		{
			sql: `DELETE FROM response WHERE id = ?1 AND ${allowed}`,
			params: [withdrawal.responseId, may],
		},
	];
}

/**
 * Gives a form a new definition: the definition's row, and the form pointing at it. Both only
 * while the form is still there, still this account's, and (for a definition that does not say
 * who runs the form) not open. The row is conditional as well as the pointer: a definition
 * written for a form that was deleted a moment ago would lie under its id, and whoever used
 * the id next would be shown it as a version of theirs. The last statement is the form's; it
 * changes no row when the replace lost.
 */
export function replaceDefinitionStatements(replace: {
	formId: string;
	ownerId: string;
	hash: string;
	json: string;
	title: string;
	hasController: boolean;
	now: number;
}): Statement[] {
	const may = `(?5 = 1 OR state <> 'open')`;
	const controller = replace.hasController ? 1 : 0;
	return [
		{
			sql: `INSERT INTO definition (hash, form_id, json) SELECT ?1, ?2, ?3
				WHERE EXISTS (SELECT 1 FROM form WHERE id = ?2 AND owner_id = ?4 AND ${may})
				ON CONFLICT (hash) DO NOTHING`,
			params: [replace.hash, replace.formId, replace.json, replace.ownerId, controller],
		},
		{
			sql: `UPDATE form SET definition_hash = ?1, title = ?3, updated_at = ?6
				WHERE id = ?2 AND owner_id = ?4 AND ${may}`,
			params: [
				replace.hash,
				replace.formId,
				replace.title,
				replace.ownerId,
				controller,
				replace.now,
			],
		},
	];
}

/**
 * Deletes a form and everything under its id, and retires the id to the account that had it.
 * The answers first and by name, not left to the table's ON DELETE; the id is retired while
 * the form's row can still say whose it was; the form before its definitions, because it
 * points at one of them.
 */
export function deleteFormStatements(form: { id: string; ownerId: string }): Statement[] {
	// Still this account's form: nothing is removed under an id that is someone else's by now.
	const OWNED = "EXISTS (SELECT 1 FROM form WHERE id = ?1 AND owner_id = ?2)";
	return [
		{
			sql: `DELETE FROM answer WHERE response_id IN (SELECT id FROM response WHERE form_id = ?1)
				AND ${OWNED}`,
			params: [form.id, form.ownerId],
		},
		{
			sql: `DELETE FROM response WHERE form_id = ?1 AND ${OWNED}`,
			params: [form.id, form.ownerId],
		},
		{
			sql: `DELETE FROM detached_answer WHERE form_id = ?1 AND ${OWNED}`,
			params: [form.id, form.ownerId],
		},
		{
			sql: `INSERT INTO retired_form_id (form_id, owner_id)
				SELECT id, owner_id FROM form WHERE id = ?1 AND owner_id = ?2
				ON CONFLICT (form_id) DO UPDATE SET owner_id = excluded.owner_id`,
			params: [form.id, form.ownerId],
		},
		{ sql: "DELETE FROM form WHERE id = ?1 AND owner_id = ?2", params: [form.id, form.ownerId] },
		{
			sql: `DELETE FROM definition WHERE form_id = ?1
				AND NOT EXISTS (SELECT 1 FROM form WHERE id = ?1)`,
			params: [form.id],
		},
	];
}
