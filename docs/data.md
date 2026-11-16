# What is stored, where, and for how long

For whoever runs a deployment of Gateweave Forms. It says what the app keeps, what each way of
deleting removes, and what remains afterwards that the app cannot reach. It describes the
software. What you owe the people who answer your forms is for you to work out; this page is the
facts you will need for that.

Three kinds of people appear below. A **respondent** answers a form and has no account. An
**owner** has an account and runs forms; a form's definition names its **controller**, the
person or organisation a respondent can turn to, which a form must have before it can take
answers. The **operator** runs the deployment: the Cloudflare account, the Worker and its
database. On a small deployment the three roles may be one person.

Respondents are shown a shorter version of this at `/f/<form>/stored`, linked from every form's
first page. That page takes its list from the same schema as the tables below, and a test
(`apps/web/test/stored.test.ts`) fails when a column is added without a line for it.

## Where things are

Everything the app stores is in one D1 database. It uses no KV, no R2 and no Durable Object.

### About a respondent

| Table             | Holds                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `response`        | A random id, the form, the version of the definition it began under, a seal of its secret, the device class, the card the person is on, and when it was begun, last changed and finished |
| `answer`          | One row per answer: the response, the question, the item, the value, how long the question was on screen in a visible tab, how often the answer was replaced, and when it last changed   |
| `detached_answer` | What a form keeps apart, such as an address for the results: a random key, the form, and the answers. No response, no time                                                               |

Not stored, in any table or log: a name (unless a question asks for one), a network address, a
user agent, a cookie. The device class is `phone`, `tablet` or `desk`, from the window's width
when the response began. The secret that opens a response is never stored: the database keeps
a seal that proves it, and the secret itself is in the fragment of the response's address,
which a browser does not send.

### About a form

| Table             | Holds                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `form`            | The id, the owning account, the title, whether it is a draft, open or closed, and the version new responses start under         |
| `definition`      | Every version of the form's definition that was ever current, as JSON, with a count of the responses to it that were taken back |
| `retired_form_id` | The id of each form that was deleted and the id of the account that had it. Nothing else of the form                            |

The controller's name and contact are part of the definition, and so of every version that has
them.

### About an owner

Better Auth's tables: `user` (name, email address), `account` (the password, hashed),
`session` and `verification`. Sessions are stored without a network address and without a user
agent; the columns exist and are left empty.

### Outside the database

- **Rate Limiting counters**, held by Cloudflare for a minute at a time. Their keys are a
  form's id (starting a response, storing a kept-apart answer), an email address that was tried
  or an account's id (signing in, signing up, changing a password), and, for requests to
  `/api/auth/*` only, the sender's network address. That last one is the one place the Worker
  reads a network address; it is a counter's key and is neither stored nor logged. Nothing a
  respondent sends is counted by where it came from.
- **Logs.** `wrangler.jsonc` keeps the Worker's own log lines and turns invocation logs off.
  The Worker writes the names of its errors, never a message that could quote what someone
  sent, and one line about entries of `SIGN_UP_ALLOW` it ignored. If you turn invocation logs
  on, Cloudflare records each request with its address (which contains a response's id) and
  what it knows about where the request came from. Leave them off.
- **The log of a failed database query.** When a query fails, the Worker writes one line:
  `d1: a query failed (<kind>), reference <reference>: <statement>`. The kind is the database's
  error code and, where it names one, a table, a column or a constraint of the schema. The
  reference is eight random characters, which the error page shows, so that a person's report
  finds the line. The statement is the SQL as it was sent, with a `?` wherever a value was,
  cut at 600 characters. No value is in it: no answer, no kept-apart answer, no response's id
  or seal, no email address, no session token, and nothing the database itself said in other
  words. A read that failed for a moment and was sent again leaves
  `d1: a read failed (<name>) and is sent again (attempt N)`, which holds less. Better Auth
  logs the same failure once more for an account's request, as the error it was given: the
  reference and the kind. Tests hold all of this (`apps/web/test/query-failure.test.ts`,
  `apps/web/src/server/db/query-failure.test.ts`).
- **Logs written before that.** Until the version that added the line above, a failed query's
  error held the statement and its values, and Better Auth logged it. A failed read of a
  session put the session's token into the log, and a failed sign-in or sign-up the email
  address; a failed page showed the form's id and the account's id to whoever had asked for
  the page. A respondent's answers were not logged then either: their side wrote the error's
  name only. If your deployment ran such a version, search its Workers Logs for
  `Failed query:` to see whether it happened; a session whose token was logged can be ended by
  deleting its row from `session`.
- **Cloudflare's own records.** The network that carries a request sees its network address,
  and your Cloudflare account may keep analytics or firewall events about requests. The app
  does not control those. A rate-limiting rule at the edge (see
  [self-hosting](self-hosting.md)) counts by network address there, outside the Worker.
- **A respondent's browser** remembers the way back to an unfinished response (its id and
  secret, in local storage) until they finish, withdraw, or choose "Forget on this device".
- **An owner's browser** holds a session cookie.
- **Exports.** A CSV an owner downloaded is a copy on their machine. Nothing the app deletes
  later reaches it.

## For how long

Nothing expires by itself. A response, its answers and what a form keeps apart stay until
someone deletes them; a form and its versions stay until the form is deleted; an account stays
until it is deleted. If a study has an end date after which its data must go, deleting the form
is the step that removes all of it.

## What each way of deleting removes

| Who        | Does what                                          | Removed, in one batch                                                                               | Stays                                                                                                                                                |
| ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Respondent | Changes an answer that closes a later question     | The answers under the question that closed                                                          | Everything else                                                                                                                                      |
| Respondent | Takes their answers back (withdraws)               | The response and every answer in it, which is all the times as well: they are columns of those rows | A count on the version, one higher. What the form kept apart                                                                                         |
| Owner      | Deletes one response                               | The response and its answers                                                                        | What the form kept apart. No count is kept of these                                                                                                  |
| Owner      | Deletes every response of a form                   | Every response, every answer, and everything the form kept apart                                    | The form, its versions and their counts of withdrawn responses                                                                                       |
| Owner      | Deletes a form (types its id to confirm)           | Every response and answer, everything kept apart, the form, and every version with its count        | The id, retired to the account that had it (`retired_form_id`): that account can use it again, nobody else can                                       |
| Owner      | Deletes their account (gives its current password) | The `user` row, the password and every session                                                      | The ids of forms the account deleted, retired for good. Refused while the account owns a form: delete the forms first, each with its numbers in view |

**Withdrawing.** A respondent can always withdraw a response that is not finished. A finished
one can be withdrawn while the form is open, with the address it was answered from, on any
device that has that address, when the definition's `withdrawal` is `"until-closed"` (the
default). With `"until-complete"`, finishing ends it. The rule is the one of the definition the
response began under, and a later version of the form does not change it for that response.
Once the form is closed, or under `"until-complete"`, the pages name the controller as the one
to ask, and the owner can delete the response if the respondent gives them its id: the part of
its address after `/r/` and before the `#`.

**Responses from before this rule existed.** A definition that does not say gets
`"until-closed"`, and that includes every definition stored before `withdrawal` existed. So on
updating a deployment, finished responses on open forms become withdrawable by whoever holds
their address, although the first page those people saw said nothing of the kind and the
"Options" dialog told them "until you finish the form". Nobody is given less than they were
told; a study is given less certainty than it had. A study that must keep the old rule sets
`"withdrawal": "until-complete"` in its definition. That covers responses begun from then on
only: one begun under the earlier version keeps `"until-closed"`, and stays withdrawable until
the form is closed. Closing the form is what ends it for all of them.

**What a form keeps apart is not removed by withdrawing.** Such a row names no response, so
there is nothing to find it by. The pages say so before and after, and say to ask the
controller. An owner asked to remove one can only find it by its content (an address, say),
and only once the form is closed and holds five such rows, which is when the app shows them;
before that, the operator can find it in the database.

**The count of withdrawn responses** is one number per version: before and after finishing are
not told apart, and there is no time and no id. It is not what tells an owner that someone
withdrew. An owner sees that a response is gone from the list, and may have read or exported
its answers before; the count adds only that it was taken back by the person who gave it, and
not deleted some other way. The page for respondents says this in those terms. More under
"What an operator or an owner could still infer" in [architecture](architecture.md).

**A deleted form's id is retired.** A form's id is its address, and links to it outlive it: an
invitation, a saved copy of a consent. So the id of a deleted form can be used again by the
account that had it and by nobody else, who are told what anyone is told about an id in use.
When that account is deleted the id stays retired for good, since the row then names an
account that no longer exists. For the same reason a page asked for under a version the form
never had (`/f/<form>/consent?v=…`, `/f/<form>/stored?v=…`) is not found, and never shows the
current wording in its place.

**Deleting an account frees its place on the sign-up list.** `SIGN_UP_ALLOW` is a setting, not
something the app can change. After an account is deleted its address is still on the list,
and since no address can be verified yet, whoever signs up with it next gets a new account.
Take the address off the list when its owner deletes their account. The account page says so.

## How much one deletion can remove

Deleting a form, and deleting every response of a form, are each one batch, which is one
transaction: all of it or none. What is known about its size:

- Measured on a local database: a form with 500,000 answer rows was deleted in 2.4 seconds.
  That is the local runtime, not D1 as deployed, where the same batch was not measured.
- From Cloudflare's documentation, not measured: the Workers Free plan allows 100,000 rows
  written a day, and a deleted row counts as a written one. A form with more answers than what
  is left of that day's allowance cannot be deleted in one step there. The paid plan has no
  such daily ceiling.

When the database refuses the batch, for size or any other reason, nothing was deleted, and
the app says so in words instead of answering with a bare error: delete responses one at a
time to make the form smaller and try again, or delete in the database yourself. There is no
way yet to delete a form's responses in parts from the app.

## What "deleted" means: D1 Time Travel

Deleted means removed from the database as it is now. D1 keeps its own history, called
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): the database can be
restored to any minute of the last **30 days** on the Workers Paid plan, and of the last 7 days
on the free plan. So for that long after a deletion, the operator can bring the deleted rows
back by restoring the database, and nobody else can. After that they are gone from the history
too. The app says "up to 30 days" wherever it deletes, and on the page for respondents.

This has consequences worth planning for:

- **A restore undoes deletions.** Restoring the database to an earlier moment brings back
  every response withdrawn or deleted since then, and every form and account. The app keeps no
  list of what was deleted, on purpose: such a list would be a record of who withdrew. If you
  ever restore, expect to be asked again by the people whose deletions you undid, and say so
  to the controllers of the forms concerned.
- **The history shows when a row first existed.** That is what lets an operator pair a
  kept-apart answer with a response, and tell when a count of withdrawn responses went up. It
  is described in [architecture](architecture.md), and it is why the app never promises more
  than "stored without anything that names your response".
- **The app cannot shorten it.** Time Travel is part of D1 and always on; the app has no
  setting for it and knows of none in D1. If 30 days is longer than you can accept for a
  study, D1 is the wrong place for that study's data.
- **Your own backups are yours.** A `wrangler d1 export`, or any other copy you take, holds
  whatever was in the database then, for as long as you keep it. Give copies an end date.
