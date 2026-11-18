## What and why

<!-- What does this change, and why is it needed? Link the issue it closes: "Closes #123". -->

## How it was tested

<!-- Commands you ran and what you checked by hand. Screenshots help for UI changes. -->

- [ ] `pnpm verify` passes
- [ ] `pnpm test:e2e` passes
- [ ] Tests cover the change (every bug fix has a test that fails without it)

## Deploy notes

<!-- Delete what does not apply. -->

- [ ] Adds a generated D1 migration (commit it; never edit one that has been merged)
- [ ] Adds an environment variable or secret (document it in `.dev.vars.example` and
  `docs/self-hosting.md`; declare a required secret in `wrangler.jsonc`)
