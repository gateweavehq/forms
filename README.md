# Gateweave Forms

Surveys and forms whose job is that people finish the long ones. Open source (AGPL-3.0), and built
to run as one Cloudflare Worker, like the rest of the Gateweave family.

**Status: the first slice, running locally only.** There is no builder, no sign-in and no results
page yet. What exists is the part everything else rests on: how a form is defined, an importer for
forms that already exist on Tally, and the respondent's side.

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

The first page lists the two made-up forms in [`examples/`](examples): a survey about baking bread
at home, of the shape the product is for, and a two-question feedback form.

## Import a form from Tally

Save the JSON inside the `__NEXT_DATA__` script of a Tally form's page (or the page itself), then:

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
| `apps/web`              | The Worker: the respondent's pages, the JSON API, D1 storage    |
| `examples/`             | Made-up forms, served at `/f/<id>`                              |
| `docs/`                 | [Architecture](docs/architecture.md)                            |

Guidance for contributors and coding agents is in [AGENTS.md](AGENTS.md).

## Licence

[AGPL-3.0-only](LICENSE).
