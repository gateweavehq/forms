# Architecture

Gateweave Forms is one Cloudflare Worker (TanStack Start, D1) and two packages of plain
TypeScript. This page says how the parts fit and why they are shaped as they are. It describes
what is built; the last section lists what is not.

## The definition (`packages/schema`)

A form is a JSON document, checked with zod. Everything else reads it: the pages, the server's
validation, the importer's output.

```
form     { version, id, title, controller?, withdrawal?, consent?, sections[], end? }
section  { type: "questions", id, title, text?, minutes?, questions[] }
       | { type: "repeat", id, title, text?, minutes?, groups[], block }
group    { id, title, items[] }
item     { id, label, name?, definition?, detail? }
block    { status[], followUps[], followUpsIntro? }
question { id, type, label, description?, detail?, required?, showIf?, detached?, … }
```

- **A `repeat` section is the point of the product.** A long survey is mostly one short question
  asked for many items. Written as one block and a list of items, it can be asked one item to a
  card, and its answers can later be read per item. Without it, a 40-item survey is 40 copies.
- **Question types**: `short_text`, `long_text`, `number`, `email`, `single_choice`,
  `multiple_choice` (with `max`), `dropdown`, `ranking`, `grid` (rows with one choice each) and
  `fields` (several short lines under one question). An option can ask for a line of text
  (`specify`).
- **A block's wording** can use `{{item.label}}` and `{{item.name}}`. The name is what the item is
  called inside a sentence when that differs from its heading; it is the label when absent.
- **Rules** (`showIf`) look at earlier answers: `{ question, is }`, `{ question, isNot }`,
  `{ question, includes }`, `{ question, answered }`, with `row` for a grid, combined by `all`,
  `any` and `not`. Inside a block, a rule reads the same item's answers. A question that is not
  shown counts as unanswered for the rules after it, so changing an answer closes what hung on
  the old one. `isNot` holds for a missing answer too: a follow-up shown when the
  status "is not X" is also asked of an item whose status was passed. To ask it only of those
  who answered, combine it with `answered`.
- **`required` means all of a question**: every row of a grid, a ranking of every option, every
  field of a `fields` question. A single field can be marked required by itself, which makes the
  question one that needs an answer without asking for its other fields (`missingFrom`).
- **A `detached` question** is asked after the response is complete and stored without anything
  that names it. Rules may not cross that line in either direction.
- **Ids are unique across the form** (questions, items, groups), because answers are stored under
  them. Text is data (paragraphs of spans with bold, italic and links), never HTML.
- **`controller`** is who runs the study: a name and a way to reach them. The shape lets it be
  missing, so that a draft, an older definition and a Tally import are all valid; the app
  refuses to open a form for answers without one (`notOpenable` in `server/owner.ts`), and a
  form's Settings page can add it.
- **`withdrawal`** is until when a person can take their answers back themselves:
  `"until-closed"` (also after finishing, for as long as the form is open) or
  `"until-complete"`. Left out, it is `"until-closed"`, and it is not filled in on parsing: a
  stored definition is named by a hash of its content. Read it with `withdrawalOf`. It lives
  in the definition, not beside the form, because the first page states it and a response
  keeps the definition it began under: what a person was told is what holds for them, whatever
  the form says later.

`parseDefinition` checks the shape and then what a shape cannot say: ids used twice, rules that
point at nothing, at themselves, forward, into another section's block or across the detached
line, a status question that is not a single choice. It reports every problem with a path a
person can follow.

### Answers

```
{ version: 1,
  questions: { <question id>: answer },
  items:     { <item id>: { <question id>: answer } } }
answer = { value | null, activeMs, changes }
```

`value` is `null` for a question that was shown and passed. `activeMs` is the time the question
was on screen in a visible tab, over every visit. `changes` counts how often an answer that was
there was replaced by a different one.

### The flow

`flow(definition, answers)` returns the ordered steps a person goes through: the start of each
leg, each question, and in a repeat section, per group, the status question of every item, then
an introduction to the follow-ups, then the follow-ups item by item. It is pure and shared: the
browser uses it to move, and the server to know which required questions are shown.

Rules only look backwards, so answering a step never changes the steps before it.

## The importer (`packages/tally-import`)

Tally holds a form as a flat list of blocks. The importer works in two passes.

1. **Read.** Blocks become pages of texts and questions. A title joins the input after it. A
   title's run of text inputs becomes one `fields` question. A grid with one row becomes the
   single choice it is. A tick that only reveals text becomes detail behind "more". Each rule is
   resolved to the question and option it names; several rules that show the same block become
   `any`. A first page of text ending in one required tick becomes the consent. What a definition
   cannot hold (an unknown block type, a rule that does more than show blocks, text that comes
   and goes) stops the import with a message, instead of being dropped.
2. **Fold.** Consecutive pages that consist of the same questions under one heading per item
   become one `repeat` section: a group per page, an item per heading. The copies are compared
   slot by slot with the item's name taken out. If they differ in anything else, the pages stay
   as they were and the report lists each difference. `acceptDifferences` takes what most copies
   have and lists what it settled. Copies that ask different questions are never folded.

The result is run through `parseDefinition`, so an import is a valid form or a list of problems.
The report says what the source held, what each section became and what was changed on the way.

## The app (`apps/web`)

### Pages

| Address                           | What it is                                                      |
| --------------------------------- | --------------------------------------------------------------- |
| `/`                               | A way in for the people who run forms. Lists no forms           |
| `/f/<form>`                       | The form's title and consent. Starting makes the response       |
| `/f/<form>/r/<response>#<secret>` | The cards. Opening this address anywhere continues the response |
| `/f/<form>/consent`               | The consent text on its own, to print or keep                   |
| `/f/<form>/stored`                | What the server stores when someone answers, in plain words     |
| `/login`, `/account`              | Signing in and up, and the account                              |
| `/forms`, `/forms/new`            | A person's forms, and bringing one in                           |
| `/forms/<form>`                   | Its results: overview, items, questions, responses, kept apart  |
| `/forms/<form>/settings`          | Opening and closing, who runs it, versions, deleting            |

A form is a row in `form` that belongs to one account. Its id is what its address carries, so
it never changes; its wording changes by pointing at a newer definition. An id is free only
when no form has it and nothing was ever answered under it: responses can outlive their form,
and whoever took the id next would otherwise be shown them. It is a `draft` (its
link says it is not open), `open`, or `closed` (no new responses; those begun can finish).

The files in `examples/` are served only where `FORMS_EXAMPLES` is `"1"`, which development and
the tests set. On a deployment a form exists because someone brought it in.

### API

| Request                             | Does                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| `POST /api/forms/<form>/responses`  | Starts a response. Returns its id and secret, once         |
| `GET /api/responses/<id>`           | The answers so far, the position, whether it is complete   |
| `POST /api/responses/<id>/progress` | Stores one answer as it is given, and the new position     |
| `POST /api/responses/<id>/complete` | Closes the response. Refused while a required one is empty |
| `DELETE /api/responses/<id>`        | Withdraws a response, with its answers (see below)         |
| `POST /api/forms/<form>/detached`   | Stores the answers a form keeps apart                      |

The four under `/api/responses` need `Authorization: Bearer <secret>`. A wrong secret and an
unknown id get the same 404. Bodies are JSON, checked with zod, at most 64 KB.

`GET /api/responses/<id>` and the answer to completing say `canWithdraw`: whether the server
would take the answers back if asked now. The page shows "Take my answers back" by it, and
never works it out itself.

The owner's addresses are under `/api/owner`, and need a session:

| Request                                         | Does                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| `POST /api/owner/preview`                       | Says what a definition or Tally page would become |
| `POST /api/owner/forms`                         | Brings a form in, as a draft                      |
| `POST /api/owner/forms/<form>/definition`       | Gives it a new definition                         |
| `POST /api/owner/forms/<form>/state`            | Opens or closes it                                |
| `POST /api/owner/forms/<form>/controller`       | Says who runs it, as a new version                |
| `DELETE /api/owner/forms/<form>`                | Deletes it and everything under its id            |
| `DELETE /api/owner/account`                     | Deletes the account, once it has no forms         |
| `GET /api/owner/forms/<form>/export/<name>`     | `responses.csv`, `codebook.csv`, `detached.csv`   |
| `DELETE /api/owner/forms/<form>/responses`      | Deletes every response, and what is kept apart    |
| `DELETE /api/owner/forms/<form>/responses/<id>` | Deletes one response                              |

Bodies there may be up to 4 MB, because a Tally form's page data runs to a megabyte or two.

The two that delete take what the person typed to confirm (`{ "confirm": … }`): the form's id,
or the account's email address. The page asks for it, and the server does not take the page's
word that it did.

### Taking answers back

A respondent has no account, so what lets them take their answers back is what lets them read
them: the secret in their address. Whoever holds the address can do it, on any device.

- **Before finishing**, always, whatever the form's state.
- **After finishing**, while the form is **open** and the definition the response began under
  says `"until-closed"`. Closing the form ends it: that is when a study starts counting, and
  what it has counted should not change under it. Opening the form again allows it again.
- The server decides, in the statements that delete: each asks again whether the response is
  still unfinished, or the form still open, so that a request to close the form or complete
  the response that arrives in between cannot be overtaken (`withdrawResponse`,
  `server/responses.ts`).
- **A closed form answers like a wrong secret and a missing response**, with the same 404 and
  the same bytes: the address says nothing about a form's state. A form whose rule is
  `"until-complete"` answers 409 for a finished response, as it always has.
- **One batch** deletes the answers and the response. The time a question was on screen is a
  column of its answer, and the times a response was begun and finished are columns of the
  response, so nothing of it is left but one thing: `definition.withdrawn`, the count of
  responses to that version that were taken back, goes up by one in the same batch.
- **What the form kept apart stays.** Such a row names no response, so there is nothing to find
  it by. The end page says so before the person confirms, the page that follows says so again,
  and both say to ask whoever runs the form.
- When it is over (the form closed, or the rule `"until-complete"`), the end page and the first
  page name the controller as the one to ask.

Starting a response and storing a kept-apart answer make the mirror-image check: for a form
that has a row, their inserts ask that the form is still there and open, so that a request
that read the form a moment before it was deleted or closed writes nothing. No test holds a
request in that gap, so this rests on reading the statements.

### What a respondent is told

The first page shows, under the form's own words: who runs it and how to reach them, until
when answers can be taken back, and a link to `/f/<form>/stored`. That page is made from the
server's schema, not written beside it: `storedColumns` (`server/stored.ts`) lists the columns
of `response`, `answer` and `detached_answer`, the page shows a line of plain words for each
(`strings.stored.columns`), and a column without words is shown by its name.
`test/stored.test.ts` compares the page with the tables as the migrations made them, and fails
on a column that is missing or has no words. The page also says what is not stored, what
taking answers back removes and leaves, and how long a deleted answer stays in the database's
own history. [data.md](data.md) is the same for whoever runs a deployment.

### Accounts, and who may see results

The people who run forms sign in with an email address and a password (Better Auth, set up as
in Gateweave Guard). Respondents never do. The two sides do not meet: nothing under `/f/` or
the respondent's API reads a session, and nothing on the owner's side takes a response's secret.

- **One place decides ownership.** `ownedForm` in `server/owner.ts` returns a form's row only to
  the account it belongs to. Every owner page, server function and address starts there, and the
  functions that read responses take that row, not an id.
- **"Not found" is one answer.** A missing form, someone else's, and a request with no session
  get the same response. `test/ownership.test.ts` asks every page and address as another
  account and as nobody, and compares the bytes with what a missing form gets.
- **A change must come from the app's own pages.** The session cookie is `SameSite=Lax`, which
  keeps it off the POSTs other sites start in current browsers. Every request that is not a GET
  must carry the app's own `Origin` as well, so that this does not rest on one browser default.
- **Sessions hold nothing about the device.** Better Auth's columns for the network address and
  the user agent are stored empty, and its own limiter is off.
- **Tries are counted three ways** through Rate Limiting bindings, before Better Auth sees the
  request:
  - _Per email address tried_ (`AUTH_LIMIT`, ten a minute), for signing in and signing up. This
    is what stops guessing at one account's password, wherever the guesses come from. It has a
    cost that should be known: someone who keeps trying a known address holds its owner out of
    signing in for as long as they keep at it.
  - _Per account_ (the same binding), for changing a password, which asks for the current one
    and would otherwise be a way to guess at it with a stolen session.
  - _Per sender_ (`AUTH_SENDER_LIMIT`, thirty a minute), for every request to `/api/auth/*`
    that is not a read, so that one sender cannot go through a list of addresses. This is the
    one place the Worker reads a network address (`CF-Connecting-IP`). It is the key of that
    counter and nothing else: not stored, not logged, and never read for anything a respondent
    sends.
- **Who may make an account** is `SIGN_UP_ALLOW`: whole email addresses. Without it anyone
  can, so a deployment should set it. Two things follow from there being no email yet, so that
  no address can be verified:
  - An entry that names a domain (`@example.org`) is **ignored**, and the log says so once. It
    would admit anyone who types an address at that domain. A list of nothing but domains
    admits nobody.
  - A listed address belongs to **whoever signs up with it first**. Sign up straight after
    listing an address, and list no address whose owner will not.

  With the list set, an address that is not on it and one that is on it and already has an
  account get the same answer, so the list cannot be read off by trying addresses.

There is no email yet, so no password reset and no verification of an address. `/update-user`
is switched off: no page uses it, and it would store a picture's address.

### Results (`packages/results`)

Results are worked out in a package with no storage in it, from a definition and the responses
to it, so that the numbers a study will quote can be checked by hand: its tests run over eight
made-up responses with the working written beside them.

- **Per version.** A response belongs to the definition it began under, and the same question
  id can mean something else in another, so results are never added up across two. Each page
  names the version it shows and how many responses that is.
- **Seen and answered.** A question that was shown and left empty is stored with no value. Its
  summary gives both counts, and every share is out of those who answered.
- **Active time** is the time questions were on screen in a visible tab, added up. Medians are
  of completed responses.
- **Where people stopped** is, for each unfinished response, the last question of its own
  flow that it answered or passed, by part of the form and question by question. It is worked
  out from the answers the server holds. The position a browser saves is not used: it is the
  browser's word, and it moves when someone only looks back.
- **Signals** mark what is worth a second look and prove nothing: a completed response under
  30% of the median active time, and a group where three or more items got the same status.
- **Filters** are a device class and one answer of a single-choice question asked once. They
  travel in the page's address.
- **The wide export** has one row per response and one column per thing asked, an item's
  questions under `<item>.<question>`; the codebook says what each column and value means. A
  cell that begins with `=`, `+`, `-` or `@` gets a leading apostrophe: answers are typed by
  strangers, and a spreadsheet would run them for the person who opens the file.
- **What is kept apart** has its own page and its own export, and never appears beside a
  response. Both answer only once the form is **closed** and holds **at least five** such rows,
  and give them in an order drawn anew on every read; before that the page says why, and how
  many are missing. The reasons are under "What an operator or an owner could still infer".
- **Taken-back answers are left out.** Everything in the package reads a response through
  `reached`, which keeps only what the response's own flow asks. The server removes such rows
  itself (see Storage); the results do not rely on that.

A page reads every response of the version it shows. That is fine for the hundreds a study
gets; a form with many thousands would want its counts kept as they change.

### Limits on the open addresses

Starting a response and storing a detached answer need no secret, so anyone can call them. Two
things stand in the way of a flood, and a third is planned:

- **In the Worker, a ceiling per form** (`ratelimits` in `wrangler.jsonc`, Cloudflare's Rate
  Limiting binding): so many starts and so many detached answers a minute, counted with the
  form's id as the key. Over it, the request is refused with 429 before anything is stored, and
  the page says to try again in a minute. The Worker reads no network address, so the ceiling
  cannot tell one sender from another: it keeps the tables from being filled, and a flood can
  still keep real people out for as long as it lasts. The binding counts per Cloudflare location,
  so it is a ceiling and not an exact count.
- **At Cloudflare's edge, a rule per address**, which the operator sets and the Worker never
  sees: a WAF rate-limiting rule on `POST /api/forms/*` (for example, a few requests a minute
  from one address), and one on `POST /api/auth/*` (for example, twenty a minute). The second
  backs up the Worker's own count per sender, and stops a flood before it costs a request. This is what stops one sender without stopping everyone, and it keeps the
  address out of the Worker, its tables and its logs. It is not part of this repository: a
  deployment without it has the ceiling only. [self-hosting.md](self-hosting.md) gives the two
  rules field by field, and what each Cloudflare plan allows of them.
- **Later, Turnstile on Start**, so that a response is started by a browser a person is using.

### Storage (D1)

- `definition`: each definition a response was started under, as JSON, under a hash of its
  content. A form that has not changed adds no row. Beside it, `withdrawn`: how many responses
  to it were taken back by the people who gave them.
- `response`: id, form id, the hash of its definition, the version of the answers' shape, a seal
  of the secret, the device class, the position, and when it was created, updated and completed.
- `answer`: one row per response, question and item, with the value as JSON, the active time and
  the number of changes. The server counts a change in the statement that writes the answer.
- `detached_answer`: a random key, the form id and the answers. Nothing else.
- `form`: id, the owning account, title, state, the hash of the definition new responses start
  under, and when it was created and updated.
- `user`, `session`, `account`, `verification`: Better Auth's tables, for the people who run
  forms. Deleting a `user` row in the database deletes their `form` rows and leaves the
  responses, which is why the app refuses to delete an account that still owns a form.

**Deleting a form** removes, in one batch, its responses and their answers, what it kept
apart, its row and every definition it has had (`deleteForm`, `server/owner.ts`). Nothing is
left under its id, so the id is free again. **Deleting an account** removes the `user` row
with its sessions and password, in a statement that asks again whether it owns a form
(`deleteAccount`): the forms go first, one by one, each with its numbers in view, because
deleting a form is a decision about a study's data and deleting an account should not make it
by the way.

**An answer to a question the flow no longer asks is deleted when the answer that closed the
question is saved.** Someone who changes "stopped" to "never" has taken back why they stopped,
whether or not they go on to finish; kept until completion, it would sit in the results of
exactly the responses that were not finished. The page drops it from its own copy at the same
moment, so changing the answer back asks the follow-up again, empty. Completion applies the
rule once more, for a row that got past it. Deleting was chosen over marking because a mark is
something every export and count would have to remember. The rule is one function,
`reachedAnswers` in `packages/schema`, used by the server, the page and the results.

A definition is stored as one row and may weigh at most 1 MB (D1 takes no row above 2 MB); a
larger one is refused before anything is stored. One nested more than 32 levels deep is
refused before its shape is read. A question's id may not be one of the export's own column
names (`response`, `device`, `started`, `completed`, `active_seconds`), nor an item's id.

"Deleted" means removed from the database as it is now. D1 keeps 30 days of history (Time
Travel), from which whoever runs the deployment can restore the database as it was. The app
says so wherever it deletes.

A response is checked against the definition it started under, for as long as it is open, and
the page asks that definition's questions: when the form has changed since, `GET
/api/responses/<id>` sends the stored definition along. Answers only mean something against the
questions they were given to, so the results side will read them against the same row.

### What is stored about a person, and what is not

- **No network address and no user agent** is read or stored. `device` is `phone`, `tablet` or
  `desk`, from the viewport's width when the response began. Invocation logs are switched off in
  `wrangler.jsonc`: they hold each request with the metadata Cloudflare has about it, and a
  promise to store nothing about who answered has to cover logs as well.
- **The secret** is in the address's fragment, which browsers do not send, and in a request
  header. The database keeps a seal: the response's id signed with the secret as the key (HMAC),
  checked with `crypto.subtle.verify`, which compares in constant time.
- **Detached answers** are sent after the response is closed, in a request that carries no
  response id and no secret, and are stored with no time. Their key is random because SQLite's
  own numbering is the order of arrival, which would pair each row with the response completed
  just before it.

### What an operator or an owner could still infer

"Stored without anything that names your response" is what the storage gives, and the app, the
docs and the examples promise no more than that. It is not unlinkability. Two kinds of people
could try to pair a detached answer with a response, and they can do different things.

**The form's owner** sees responses arrive, each with its time of completion. A list of
detached answers that grew beside them would pair every row with the response completed just
before it. So the owner is shown them, on the page and in the export, only when the form is
closed and holds at least five, in an order drawn anew on every read, and a row is accepted
only while the form is open. What remains for an owner:

- **Counting, on a very small study.** Five rows among five completed responses are those five
  people's, whatever the order. The threshold keeps one row from being one person; it does not
  make a handful of people a crowd.
- **Reopening and closing.** An owner who closes a form, looks, opens it again and closes it
  after the next completion sees one row more than before, and the rows are few enough to
  compare. Nothing stops this. It takes intent, and it leaves the form's state changes behind
  as the only trace.

The number of kept-apart rows is not said while a form is open either: the settings page and
its delete dialog say only that such answers, if there are any, are removed too. A number that
went up just after a completion would say that this person left something.

**The count of withdrawn responses** raises the same question for the owner. What is kept is
one number per version: a response taken back before finishing and one taken back after are
not told apart, there is no time, and no id. What an owner can still work out:

- **Which one, by looking twice.** A response that was in the list, or in an export, and is
  not there now was withdrawn or deleted. An owner who exported yesterday still has those
  answers: withdrawing removes them from the server, and cannot reach a copy. The pages for
  respondents say so. Nothing in the app can prevent it; a study that promises more has to
  promise it about its own copies.
- **When, between two looks.** The count is shown without a time, but an owner who reads the
  page often knows between which two readings it rose. Completion times of the responses that
  remain narrow nothing further, since the one that left took its times with it.
- **That a kept-apart row has lost its response.** Kept-apart rows stay, so a closed form can
  hold more of them than it has completed responses. That says that some of those rows belong
  to people who withdrew, and not which.
- **On a very small study, who.** One withdrawal among three people the owner invited by name
  is not hard to place. The count does not make that worse than the missing response already
  does, and it is said here because no number can make a small group a crowd.

The count was kept, against keeping nothing, because a study reports how many withdrew, and
because started and completed counts that fell with no explanation would send an owner
looking for the reason in exactly the way described above.

**Whoever runs the deployment**, or reads its database, has all of that and more:

- **Time, through D1's history.** A response's `completed_at` is stored to the millisecond,
  and its detached answer arrives seconds later. The row carries no time, but D1 keeps 30 days
  of history (Time Travel): the database as it was at a given moment can be restored, which
  shows when a row first existed. Compared with completion times, that pairs rows with
  responses whenever completions are not close together.
- **Cloudflare's own records of requests**, to whatever extent the account keeps any. The
  Worker's invocation logs are off; the two requests still came from one connection.
- **The table itself**, without the threshold or the shuffle, which are the app's and not the
  database's.
- **A withdrawn response, for up to 30 days.** D1's history holds the database as it was
  before the deletion, and shows when the count on a definition changed.

Closing the first of those would take holding detached answers back and writing them in
shuffled batches, so that a row's first appearance says nothing about one response. That is not
built. A study that needs more than "not named" should collect contact details somewhere else.

### Why the cards behave as they do

The research is summarised in the plan (FRM-1 on the board); the design rules it led to:

| Rule                                                      | Because                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| No bar, no percentage; legs, groups and items in words    | A display that looks slow early raised quitting from 13% to 22%                              |
| One item to a card, every answer visible                  | Item by item beats grids: fewer skipped answers, less straight-lining                        |
| Status for the whole group first, then the follow-ups     | Follow-ups in place teach people to avoid the answer that opens them                         |
| A tap moves on, only on item cards, and can be turned off | It is liked and does not raise quitting; its risk is fewer corrections, so Back is one press |
| Moving on is said beforehand and announced                | WCAG 3.2.2 (On Input), 4.1.3 (Status Messages)                                               |
| Number keys act only while focus is inside the card       | WCAG 2.1.4 (Character Key Shortcuts)                                                         |
| Ranking by picking in order, never by dragging            | WCAG 2.5.7 (Dragging Movements)                                                              |
| Controls at least 44 pixels, nothing wider than 320       | WCAG 2.5.5 (Target Size), 1.4.10 (Reflow)                                                    |
| No timers, no points, no swiping                          | Game mechanics lowered completion in both adult experiments                                  |
| A look back at each group's answers before moving on      | Reasoning, not a finding: see below                                                          |
| Marks for one group's items, and nothing wider            | Reasoning, not a finding: see below                                                          |

Two of these rest on reasoning from what was measured, not on a study of the thing itself:

- **The look back.** What was measured is the cost it answers: with automatic forwarding people
  changed about half as many answers (Giroux et al. 2019, 20,574 respondents), and fewer in
  Selkälä & Couper 2018; a third of those who disliked it said changing an answer was hard.
  The research file reads this as the one risk of moving on by itself. That a list of a
  group's answers, each one press from its card, brings corrections back is our inference. No
  study of such a review step was found. The record of changes per answer is what would show
  whether it works.
- **The marks.** What was measured is the bar: a constant progress indicator does not reduce
  quitting across 32 experiments (Villar, Callegaro & Yang 2013), and one that looks slow early
  raised it from 13% to 22%. No study was found of marks that cover one group and never the
  form. That a handful which fills within a minute does not crawl is reasoning; if quitting
  inside long groups turns out higher with them, they should go.

`minutes` on a section is its author's estimate, shown on the opening card as "About 3 minutes".
Stating a length lowers starts a little (62% to 75% started across 10, 20 and 30 minutes in one
experiment), so it is the author's choice to give one, and nothing counts it down.

### What happens when an item's card is answered

The chosen answer fills with the accent and shows a tick from the input's own `:checked` state,
so nothing waits on a script. The card then stands still for 260 ms, leaves in 90 ms, and the
answer is stored and the next card shown 350 ms after the tap (`PAUSE_MS` and `HOLD_MS` in
`components/cards.tsx`; the keyframes in `styles.css`). The next card arrives in 110 ms.

The leaving happens inside the pause, and the pause is two timers that do not know whether
anything moved. A person who asked for less motion sees no slide and waits exactly as long. So
the active time stored for an answer means the same for both: from the card being put up to the
answer being stored, pause included, and the next card's time starts when it is put up. Back and
the buttons move at once.

The look back and the opening of a group are cards of the page, not steps of the flow
(`lib/deck.ts`). They ask nothing, and a response's stored position is always a step: on one of
these cards it is the step beside it.

The marks of a group of up to six items are buttons, 44 pixels square each. A longer group's
marks are a picture only, for every pointer: not buttons, not focusable, and hidden from screen
readers, which have the place in words. Back and the look back do the going back. A mark that
waits for its answer is drawn in the colour of quiet text, for 3 to 1 against the card.

On a phone, a card with something to press inside it lies on the bar; an opening or an
introduction, with nothing to press, stands in the middle of the space above the bar.

### Security

Every page answers with a content security policy that allows its own files only, with a nonce
for the scripts the server renders, and no inline styles. Nothing may frame a page. A form's
text is rendered from data, and its links may only be `http`, `https` or `mailto`.

Server code is imported inside handlers (`await import("#/server/…")`), so none of it reaches
the browser's bundle. A test reads the built bundle to hold that.

## Not built yet

These are seams, not features: the builder, teams and sharing a form's results, signing in
through Gateweave ID, email (and with it password reset), embedding, the public API and
webhooks, and a second layout for comparison.

A response that can no longer be taken back by the person who gave it (its form is closed, or
the form's rule is `"until-complete"`) is deleted by the form's owner, who cannot tell which
response is whose: a respondent who wants theirs removed has to give the owner its id. And
what a form kept apart can only be removed by its content, by the owner once the form is
closed and shows it, or by whoever runs the deployment.
