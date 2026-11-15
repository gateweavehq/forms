@AGENTS.md

## Claude Code

- Look up current library APIs before relying on memory. The stack moves fast (TypeScript 7,
  Vite 8, Wrangler 4, TanStack Start, zod 4, Playwright).
- Before reporting a change as done, run `pnpm verify`, or at least the affected package's
  `typecheck` and `test`. For anything a respondent sees, also run `pnpm test:e2e` and look at
  the page at 390 and at 320 pixels wide. Report failures as they are.
