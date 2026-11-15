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

In development the first page lists the two made-up forms in [`examples/`](examples): a survey
about baking bread at home, of the shape the product is for, and a two-question feedback form.
Create an account at `/login` and press "Add them to my account" to see their results as well.

## Run a form

1. **Bring it in** at `/forms/new`: paste or upload a definition, or the page of a form you have
   on Tally. You see what it becomes before anything is stored: its outline, and for a Tally form
   everything the importer folded, changed or would not fold.
2. **Open it.** A form starts as a draft, and its link (`/f/<id>`) says it is not open yet.
   Closing it later stops new responses; people who had begun can still finish.
3. **Read the results** at `/forms/<id>`: how many started and completed, median active time by
   device, where the unfinished ones stopped, every question added up, each repeated section as a
   table of its items, the responses one by one, and filters by device and by one answer. Every
   number comes with what it is out of.
4. **Export** the responses as a wide CSV with a codebook, and the answers kept apart on their
   own. Then delete one response or all of them: the page says how much it will remove first.

Only the account that brought a form in can see its results. To everyone else, signed in or not,
its pages answer "not found", exactly as a form that does not exist.

Someone answering needs no account, and can do three things about their own answers: withdraw
before finishing (which deletes them), make their browser forget the way back, and open the
consent text on a page of its own to print or keep.

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

| Path                    | What lives there                                                |
| ----------------------- | --------------------------------------------------------------- |
| `packages/schema`       | The form definition, its rules, the answers' shape and the flow |
| `packages/tally-import` | Tally page data into a definition                               |
| `packages/results`      | A form's results worked out from its responses, and the exports |
| `apps/web`              | The Worker: respondent's and owner's pages, the APIs, D1        |
| `examples/`             | Made-up forms, served in development and in tests               |
| `docs/`                 | [Architecture](docs/architecture.md)                            |

Guidance for contributors and coding agents is in [AGENTS.md](AGENTS.md).

## Settings

| Name                 | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Required secret. Signs the sessions of the people who run forms              |
| `BETTER_AUTH_URL`    | Optional. The app's own URL, which requests that change something must match |
| `SIGN_UP_ALLOW`      | Optional. Who may make an account: addresses and `@domains`, comma-separated |
| `FORMS_EXAMPLES`     | `"1"` serves the forms in `examples/`. For development and tests only        |

`pnpm dev:setup` writes a `.dev.vars` with a random secret. On a deployment, set
`BETTER_AUTH_URL` and `SIGN_UP_ALLOW`: without the second, anyone who reaches the server can make
an account and bring forms in.

## Licence

[AGPL-3.0-only](LICENSE).
