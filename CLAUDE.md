# CLAUDE.md

Prototype suite of SRS language-learning tools. The first tool is a typed-recall
vocabulary trainer. Start with `README.md` (stack, layout, commands) and
`docs/decisions.md` (what was chosen and why, plus open questions). Check the
decisions log before proposing alternatives to anything listed there.

## Ground rules

- **Schema changes go through Atlas.** Edit `db/schema.sql`, run
  `pnpm db:diff <name>`, `pnpm db:migrate`, `pnpm db:codegen`, and commit the
  migration, `atlas.sum` and `apps/api/src/db/types.ts` together. Never hand-edit
  files in `db/migrations/` or `types.ts`.
- **Contracts live in `packages/shared/src/contracts.ts`.** API routes validate
  and serialize with them; the web client parses responses with them. Change the
  contract first, then make both sides typecheck.
- **The API is authoritative for grading and scheduling.** `@app/shared`
  grading is pure and shared; FSRS (`apps/api/src/srs.ts`) runs only on the server.
- **No build step for API and shared.** Node 24 runs `.ts` directly, so code
  must be erasable TypeScript: no `enum`, `namespace` or constructor parameter
  properties, and relative imports use `.ts` extensions (the web app uses the
  `@/` alias without extensions).
- **`apps/web/src/components/ui/` is shadcn-generated.** Prefer
  `pnpm dlx shadcn@4.23.0 add <component>` over hand-writing primitives.
- **Pin exact dependency versions** (no `^`).
- **E2E tests use page objects.** Specs in `apps/e2e/tests` talk to pages only
  through classes in `apps/e2e/pages` (one per screen); selectors live there,
  never in specs. Prefer role/label locators; use `data-testid` only where there
  is no accessible handle. Each test runs as a fresh learner (`x-dev-user`), so
  arrange state through the `api` fixture rather than shared data.
- **Auth is a dev stub** (`apps/api/src/plugins/auth.ts`). Route code should
  only rely on `request.user.id`; Auth0 replaces the stub later.

## Before committing

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm db:check
pnpm e2e    # when UI or API behaviour changed
```

API tests need Postgres running (`pnpm db:up`) and Atlas on the PATH.
