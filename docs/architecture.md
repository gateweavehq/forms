# Architecture

Gateweave Forms is one Cloudflare Worker (TanStack Start, D1) and two packages of plain
TypeScript. This page says how the parts fit and why they are shaped as they are. It describes
what is built; the last section lists what is not.

## The definition (`packages/schema`)

A form is a JSON document, checked with zod. Everything else reads it: the pages, the server's
validation, the importer's output.

```
form     { version, id, title, consent?, sections[], end? }
section  { type: "questions", id, title, text?, questions[] }
       | { type: "repeat", id, title, text?, groups[], block }
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
  the old one.
- **A `detached` question** is asked after the response is complete and stored with no link to
  it. Rules may not cross that line in either direction.
- **Ids are unique across the form** (questions, items, groups), because answers are stored under
  them. Text is data (paragraphs of spans with bold, italic and links), never HTML.

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
| `/`                               | Lists the forms this server has                                 |
| `/f/<form>`                       | The form's title and consent. Starting makes the response       |
| `/f/<form>/r/<response>#<secret>` | The cards. Opening this address anywhere continues the response |

Forms are the files in `examples/`, read when the Worker is built (`src/server/forms.ts`).

### API

| Request                             | Does                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| `POST /api/forms/<form>/responses`  | Starts a response. Returns its id and secret, once         |
| `GET /api/responses/<id>`           | The answers so far, the position, whether it is complete   |
| `POST /api/responses/<id>/progress` | Stores one answer as it is given, and the new position     |
| `POST /api/responses/<id>/complete` | Closes the response. Refused while a required one is empty |
| `POST /api/forms/<form>/detached`   | Stores the answers a form keeps apart                      |

The three under `/api/responses` need `Authorization: Bearer <secret>`. A wrong secret and an
unknown id get the same 404. Bodies are JSON, checked with zod, at most 64 KB.

### Storage (D1)

- `response`: id, form id, a hash of the definition it was started on, a seal of the secret, the
  device class, the position, and when it was created, updated and completed.
- `answer`: one row per response, question and item, with the value as JSON, the active time and
  the number of changes. The server counts a change in the statement that writes the answer.
- `detached_answer`: a random key, the form id and the answers. Nothing else.

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
  just before it. With very few responses, a detached answer can still be guessed from the
  count alone; no storage can prevent that.

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

### Security

Every page answers with a content security policy that allows its own files only, with a nonce
for the scripts the server renders, and no inline styles. Nothing may frame a page. A form's
text is rendered from data, and its links may only be `http`, `https` or `mailto`.

Server code is imported inside handlers (`await import("#/server/…")`), so none of it reaches
the browser's bundle. A test reads the built bundle to hold that.

## Not built yet

These are seams, not features: the builder, sign-in, results and export, embedding, the public
API and webhooks, email, a second layout for comparison, and deployment. Three things a
deployment needs first are also open:

- **Limits on starting responses and on detached answers.** Both addresses are open by design
  (no account), so they need a rate limit that stores no address, as the siblings' per-client
  Durable Object does.
- **Erasing.** A study must be able to export its responses and then delete them.
- **Withdrawal.** A response's address could let its owner delete it.
