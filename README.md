# Gateweave Forms

Surveys and forms whose job is that people finish the long ones. Open source (AGPL-3.0), and built
to run as one Cloudflare Worker, like the rest of the Gateweave family.

**Status: early.** A person can make an account, bring a form in, open it, and read and export
its results. There is no builder yet: a form comes in as a definition (JSON) or from a form that
already exists on Tally.

## What it does differently

A long survey is mostly one short question asked many times: forty items, the same five answers.
Forms defines that as one block of questions and a list of items, and asks it one item to a card.

- **One tap answers and moves on.** Every answer is visible as a full-width button. Back is always
  there. On a desk, number keys answer the card that has the focus.
- **Follow-ups come after the group, not under the answer that opened them.** People learn which
  answer costs more questions, and stop giving it.
- **No progress bar and no percentage.** A bar that crawls through a long section makes people
  quit. The page says which part, which group and which item.
- **Resume anywhere, with no account.** Every answer is stored as it is given. The response's
  address continues it on another device.
- **Nothing about the person is stored**: no network address, no user agent. Contact details a study
  wants kept apart are asked at the end and stored without anything that names the response.

The reasons, with their sources, are in [docs/architecture.md](docs/architecture.md).

## Try it

Requirements: Node.js 24 (see `.node-version`) and pnpm 12.

```sh
pnpm install
pnpm dev:setup   # once: creates the local database
pnpm dev         # http://localhost:4770
```

In development the first page lists the made-up forms in [`examples/`](examples): a survey
about baking bread at home, of the shape the product is for, one about herbs that asks two things
of each item, and a two-question feedback form. Create an account at `/login` and press "Add them
to my account" to see their results as well. Do that before answering one: an example that was
answered while it belonged to nobody cannot be added, like any id with answers under it.

## Run a form

1. **Bring it in** at `/forms/new`: paste or upload a definition, or the page of a form you have
   on Tally. You see what it becomes before anything is stored: its outline, and for a Tally form
   everything the importer folded, changed or would not fold.
2. **Say who runs it, and open it.** A form starts as a draft, and its link (`/f/<id>`) says
   it is not open yet. It cannot be opened until it names who runs the study and how to reach
   them: `controller` in the definition, or the two fields on its Settings page. The first page
   shows that to everyone who answers, with a link to a page that lists what is stored.
   Closing it later stops new responses; people who had begun can still finish.
3. **Read the results** at `/forms/<id>`: how many started and completed, median active time by
   device, where the unfinished ones stopped, every question added up, each repeated section as a
   table of its items, the responses one by one, and filters by device and by one answer. Every
   number comes with what it is out of.
4. **Export** the responses as a wide CSV with a codebook. Then delete one response or all of
   them: the page says how much it will remove first. (Whoever runs the server can restore its
   database as it was for up to 30 days.)
5. **Close it** to read what it kept apart, such as addresses for the results: those are shown
   and exported only once the form is closed and holds at least five, in an order drawn anew
   each time, so that watching them arrive cannot say whose each is. Closing also ends people
   taking back answers they had finished.
6. **Delete it** when the study is over, under Settings: the form, its responses, what it kept
   apart and every version go in one step, after you have typed its id. An account can be
   deleted once it has no forms.

The CSV files are UTF-8 and begin with a byte-order mark, so that a spreadsheet opened by
double-click reads them right. In R, `readr::read_csv("responses.csv")` skips the mark; with
base R use `read.csv("responses.csv", fileEncoding = "UTF-8-BOM")`. In Python,
`pandas.read_csv("responses.csv", encoding="utf-8-sig")`. A cell that begins with `=`, `+`,
`-` or `@` has an apostrophe put before it, so that a spreadsheet does not run an answer as a
formula: strip a leading `'` from text columns if your analysis needs the text as typed.

Only the account that brought a form in can see its results. To everyone else, signed in or not,
its pages answer "not found", exactly as a form that does not exist.

Someone answering needs no account, and can do three things about their own answers, from
"Options" on any card: withdraw before finishing (which deletes them), make their browser
forget the way back, and open the consent text on a page of its own to print or keep. An
answer they take back by changing an earlier one (a reason for stopping, under something they
then say they never did) is deleted at once, not kept until they finish.

After finishing, they can still take everything back from the address of their answers, on any
device, for as long as the form is open: the end page has "Take my answers back", behind a
confirmation. Closing the form ends that, and from then on the page names who runs the study
as the one to ask. A form can instead end it at finishing, with `"withdrawal":
"until-complete"` in its definition. Either way the first page says which applies. You see how
many people took their answers back, per version, and never which or when. What a form kept
apart is not removed with a response, because nothing connects the two; the pages say so.

## Import a form from Tally

In the app, choose "A Tally form's page" at `/forms/new`. From the command line, save the JSON
inside the `__NEXT_DATA__` script of a Tally form's page (or the page itself), then:

```sh
pnpm import:tally path/to/page-data.json --out examples/my-form.json
```

The importer keeps the wording, the options and the rules, and prints what it changed on the way.
Pages that write the same questions out once per item are folded into one repeated block. It
refuses to fold when the copies differ in more than the item's name and lists the differences;
`--accept-differences` takes what most copies have instead. `--detach-email` marks email questions
as stored apart. Only import forms you have the right to use.

## Commands

| Command             | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `pnpm dev`          | Run the app on http://localhost:4770 (Worker and D1 run locally) |
| `pnpm dev:setup`    | Create or migrate the local D1 database                          |
| `pnpm verify`       | Everything a change has to pass: check, typecheck, test, build   |
| `pnpm test:e2e`     | Build, then run the browser tests (Playwright) on port 4771      |
| `pnpm import:tally` | Turn a Tally form's page data into a definition                  |
| `pnpm format`       | Fix formatting and lint findings (Biome)                         |

## Repository

| Path                    | What lives there                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/schema`       | The form definition, its rules, the answers' shape and the flow                                            |
| `packages/tally-import` | Tally page data into a definition                                                                          |
| `packages/results`      | A form's results worked out from its responses, and the exports                                            |
| `apps/web`              | The Worker: respondent's and owner's pages, the APIs, D1                                                   |
| `examples/`             | Made-up forms, served in development and in tests                                                          |
| `docs/`                 | [Architecture](docs/architecture.md), [self-hosting](docs/self-hosting.md), [what is stored](docs/data.md) |

Guidance for contributors and coding agents is in [AGENTS.md](AGENTS.md).

## Settings

| Name                 | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Required secret. Signs the sessions of the people who run forms              |
| `BETTER_AUTH_URL`    | Optional. The app's own URL, which requests that change something must match |
| `SIGN_UP_ALLOW`      | Optional. Who may make an account: whole addresses, comma-separated          |
| `FORMS_EXAMPLES`     | `"1"` serves the forms in `examples/`. For development and tests only        |

`pnpm dev:setup` writes a `.dev.vars` with a random secret. On a deployment, set
`BETTER_AUTH_URL` and `SIGN_UP_ALLOW`: without the second, anyone who reaches the server can make
an account and bring forms in.

No email is sent yet, so no address can be verified. That shapes the list:

- It takes whole addresses. An entry that names a domain (`@example.org`) is ignored, and the
  log says so: it would admit anyone who types an address there.
- A listed address belongs to whoever signs up with it first. **Sign up straight after listing
  your address.**

Deploy with `pnpm --filter @gateweave/forms-web deploy:staging` (or a script like it), not with
`wrangler deploy` on a build of your own: the script checks that the build does not serve the
example forms, which a build made for the browser tests does.

[docs/self-hosting.md](docs/self-hosting.md) has the order of a deploy and the rate-limiting
rules to set at Cloudflare's edge, which the app relies on and cannot set itself.
[docs/data.md](docs/data.md) says what a deployment stores, for how long, and what deleting
does: the database keeps up to 30 days of its own history, from which deleted rows can be
restored.

## Licence

[AGPL-3.0-only](LICENSE).
