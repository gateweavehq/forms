# Contributing to Gateweave Forms

Thanks for helping out. Everyone taking part is expected to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Use Node.js 24 and pnpm 12. From the repository root:

```sh
pnpm install
pnpm dev:setup
pnpm dev
```

The app runs at http://localhost:4770. `pnpm dev:setup` creates the local D1 database and writes
`.dev.vars` with a random secret. See the [README](README.md) and
[architecture](docs/architecture.md) for how the parts fit together.

## Before a pull request

Run `pnpm verify` and `pnpm test:e2e`. The first checks formatting, types, tests and the build;
the second runs the browser tests. For a bug fix, add a test that fails without the fix. Fill in
the pull request template with what changed, how you checked it and any deploy notes.

Keep each pull request focused. A maintainer reviews the change and its checks before merging
it. Address review comments and make sure the checks pass on the final version.

## Project rules

- Use [Conventional Commits](https://www.conventionalcommits.org) and add a scope when it helps.
- Do not add AI attribution to commits, pull requests, comments or release notes.
- Keep local secrets in `.dev.vars`, never in Git. Add a placeholder to `.dev.vars.example` and
  declare a new required secret in `wrangler.jsonc`.
- Generate D1 migrations with `pnpm --filter @gateweave/forms-web db:generate` and commit them.
  Never edit a migration that has already been merged.

[AGENTS.md](AGENTS.md) has the full rules, including the data and privacy invariants.
