# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. It is the single source
of truth for how the project is built; `CLAUDE.md` only adds to it.

## The project

Gateweave Forms is an open-source tool for surveys and forms whose job is that people finish the
long ones. It belongs to the [Gateweave](https://gateweave.com) family and runs as one Cloudflare
Worker. So far it has the form definition, an importer for Tally forms and the respondent's side;
it runs locally only.

Read [docs/architecture.md](docs/architecture.md) before changing the definition, the flow,
storage or anything a respondent sees.

## Repository map

| Path                    | What lives there                                                          |
| ----------------------- | ------------------------------------------------------------------------- |
| `packages/schema`       | The definition (zod), its checks, rules, answers and flow. No server code |
| `packages/tally-import` | Tally page data into a definition, with a report and a command line       |
| `apps/web`              | The Worker: TanStack Start pages, the JSON API, D1 through Drizzle        |
| `examples/`             | Made-up forms, each named after its id and served at `/f/<id>`            |
| `docs/`                 | Architecture                                                              |
| `wrangler.jsonc`        | The Worker's config, at the root as in the sibling repositories           |

## Commands

Requirements: Node.js 24 (see `.node-version`) and pnpm 12. Run from the repository root.

| Command             | Purpose                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `pnpm install`      | Install dependencies                                                                |
| `pnpm dev:setup`    | Create or migrate the local D1 database                                             |
| `pnpm dev`          | Run the app on http://localhost:4770 (Worker and D1 local)                          |
| `pnpm check`        | Biome lint and format (`pnpm format` fixes most)                                    |
| `pnpm typecheck`    | Type-check every package (regenerates Wrangler and route types first)               |
| `pnpm test`         | Run every unit and Worker test                                                      |
| `pnpm test:e2e`     | Build, then run the browser tests (Playwright, Chromium) on port 4771               |
| `pnpm build`        | Production build                                                                    |
| `pnpm verify`       | check, typecheck, test, build                                                       |
| `pnpm import:tally` | Import a Tally form's page data (`--out`, `--accept-differences`, `--detach-email`) |

Scope a command to one package with `pnpm --filter <name> <script>`, for example
`pnpm --filter @gateweave/forms-schema test`. Run `pnpm verify` and `pnpm test:e2e` before you
consider a change done. Ports 4770 to 4779 are this product's; 4700 to 4769 belong to its siblings.

## Invariants

These are load-bearing. Breaking one breaks a study's data or a respondent's privacy, usually
silently.

1. **The definition is the contract.** The pages, the server's checks and the importer all read
   `packages/schema`. A breaking change to a shape raises `DEFINITION_VERSION` or
   `ANSWERS_VERSION`. Ids are what answers are stored under: never derive behaviour from wording.
2. **The server decides.** Every answer is checked against the definition in
   `apps/web/src/server/responses.ts` before it is stored, and the server counts changes itself.
   What the browser checks is for the person's benefit only.
3. **A response's secret stays out of every address and log.** It lives in the fragment of the
   page's address and in the `Authorization` header. The database keeps a seal of it
   (`server/secret.ts`), checked with `crypto.subtle.verify`. Never put it in a path, a query, a
   cookie or a log line.
4. **Nothing about the person is stored.** No network address, no user agent, in tables or in
   logs. `device` is the viewport's rough width. Keep invocation logs off in `wrangler.jsonc`.
5. **A detached answer is stored without anything that names its response**: no response id,
   no time, no order of arrival, and it is sent in a request without the response's secret. The
   response's own address refuses a detached question. Do not add a column, a log or a header
   that would pair the two. That is all it is: an operator can still infer a pairing (see
   "What an operator could still infer" in `docs/architecture.md`), so never write "cannot be
   linked" or "anonymous" in the app, the docs or an example.
6. **How the cards behave is evidence, not taste.** No progress bar or percentage. Follow-ups
   after the group's status questions, never under the answer that opened them. Moving on by
   itself only on item cards, said beforehand, announced, and switchable. No dragging, no swiping,
   no timers, no points. The table in `docs/architecture.md` gives the reason for each; change
   one only with evidence, and say which.
7. **Accessible by construction.** Radios and checkboxes are real inputs. Number keys act only
   while focus is inside the card. Every control is at least 44 pixels in both directions, and
   nothing scrolls sideways at 320 pixels. Each new card takes the focus at its heading.
8. **Server code never reaches the browser bundle.** In routes and server functions, import
   server modules dynamically inside the handler, as `apps/web/src/lib/forms.ts` does.
9. **Other people's forms stay out of the repository.** A real questionnaire belongs to its
   authors. Tests, fixtures, examples and docs use forms made up for the purpose.
10. **Migrations are append-only.** Generate them with `pnpm --filter @gateweave/forms-web
    db:generate` and commit them. Never edit one that has been merged.
11. **Every string the app shows is in `apps/web/src/lib/strings.ts`.** A form's own wording
    comes from its definition.
12. **A response belongs to the definition it started under.** That definition is stored
    (`definition` table) and is what the response is checked against and read with, whatever the
    form says today. Never validate or interpret a response against the current form.

## Code style

- TypeScript is strict, with `noUncheckedIndexedAccess`. Avoid `any` and non-null assertions.
- Biome formats: tabs, 100 columns, double quotes. Don't hand-format; run `pnpm format`.
- Validate untrusted input at the boundary with zod. Inside, trust the types.
- Prefer `#private` fields, named exports and small modules. Default exports only where a
  framework requires them.
- Comments explain why, not what. Match the tone and density of the file you are editing.
- Generated files are not edited by hand: `routeTree.gen.ts`, `worker-configuration.d.ts` and
  everything under `apps/web/migrations/`, except a migration whose generated statements cannot
  run (`0001_definitions.sql` says why at its top). Keep the snapshot Drizzle Kit wrote.
- Dependencies are pinned to exact versions. Shared ones go in the `catalog:` of
  `pnpm-workspace.yaml`. `drizzle-orm` stays on 0.45, as in the sibling repositories: the 1.0
  migration format does not work with Wrangler's D1 migrations.
- UI code copied into the repository must come from an MIT or Apache-2.0 source, with the source
  and its copyright notice in a comment at the top of the file. Nothing is copied in so far.

## Testing

- Test behaviour through public APIs, not internals.
- `packages/schema` and `packages/tally-import` have unit tests in `test/`. The importer's tests
  build their Tally page data with `test/tally-builder.ts` from a made-up form.
- `apps/web` has unit tests in `src/` and Worker tests in `test/`. The Worker tests build the app
  and run it in workerd through Miniflare, with a migrated D1 database and no network; see
  `test/forms-worker.ts`.
- `apps/web/e2e` has the browser tests: Playwright drives Chromium against the production build
  (`vite preview`, port 4771, its own empty local database), once at 390 by 844 with touch and
  once in a desk window. The first time, run
  `pnpm --filter @gateweave/forms-web exec playwright install chromium`. They are not part of
  `pnpm verify`. Every test starts its own response. To run them in two checkouts at once, give
  each its own port with `FORMS_E2E_PORT` (4772 to 4779).
- On Windows, keep the checkout in a short path. The local D1 database is a file deep under
  `apps/web/.wrangler`, and once its full path passes 260 characters Wrangler's migration fails
  with nothing but "internal error".
- Every bug fix gets a test that fails without the fix. Never weaken or skip a test to make a
  change pass.

## Git

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), with a
  scope when it helps: `fix(schema): refuse a rule that points at its own question`. Explain why
  in the body.
- Commits, pull requests, comments and release notes carry no AI attribution: no
  `Co-authored-by` trailer naming an AI, no "Generated with" line and no session link.
- Never commit `.dev.vars` or print its contents. The app needs no secret so far.
