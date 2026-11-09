# AGENTS.md

Prototype suite of SRS language-learning tools. The first tool is a typed-recall
vocabulary trainer. Start with `README.md` (stack, layout, commands) and
`docs/decisions.md` (what was chosen and why, plus open questions). How to
verify changes is in `docs/verification.md`; ADRs live in `docs/adr/`. Open
follow-up work is in `TODO.md`. Check the decisions log before proposing
alternatives to anything listed there.

## Environment

In Claude Code cloud sessions the SessionStart hook
(`.claude/hooks/session-start.sh`) runs `scripts/setup-agent-env.sh` before
your first turn: Node 24, pnpm, Docker, Atlas, dependencies, and Postgres
migrated and seeded. Its last line says `setup: ready` or `setup: FAILED`
with a log path. Don't install toolchains by hand; if something is missing,
rerun the script, and fix the script rather than working around it, so the
next session gets the fix. Elsewhere, follow "Getting started" in `README.md`.

**Neon (deployed Postgres)** lives only in the git-ignored `.env.neon`
(`neon env pull --file .env.neon`). Never let Neon variables into `.env`:
local dev, seeds and tests migrate and truncate whatever `DATABASE_URL`
points at, so `pnpm verify` refuses non-local databases. `neon init` writes
into `.env` by itself; restore `.env` from `.env.example` after running it.
Cloud sessions can't reach Neon over Postgres TCP (only HTTPS leaves the
container); migrations against Neon run from CI or the deploy.

## Ground rules

- **Schema changes go through Atlas.** Edit `db/schema.sql`, run
  `pnpm db:diff <name>`, `pnpm db:migrate`, `pnpm db:codegen`, and commit the
  migration, `atlas.sum` and `apps/api/src/db/types.ts` together. Never hand-edit
  files in `db/migrations/` or `types.ts`.
- **Contracts live in `packages/shared/src/contracts.ts`.** API routes validate
  and serialize with them; the web client parses responses with them. Change the
  contract first, then make both sides typecheck. Regenerate the committed
  OpenAPI snapshot with `pnpm api:openapi`; its diff is how contract changes
  get reviewed.
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
- **Screens are controller, view model, view** ([ADR 0002](docs/adr/0002-client-architecture.md)).
  Logic and text live in `@app/client` (`packages/client/src/<screen>/`: a
  controller with its state and actions, a pure view model), platform-free so
  the Expo app reuses it. Web views (`apps/web/src/views/<screen>/`) only
  render `{ vm, actions }`; `*-screen.tsx` binds them with `useScreen`; route
  files in `app/` only pass params to a screen. Biome enforces the imports
  per layer. Test controllers with `@app/client/testing` (MSW fake API built
  on the contracts), views with Testing Library on hand-built view models.
- **Auth is a dev stub** (`apps/api/src/plugins/auth.ts`). Route code should
  only rely on `request.user.id`; Auth0 replaces the stub later.

## Before committing

```sh
pnpm verify          # runs what this diff requires and prints the report
```

Or use the `/verify` skill, which also does the manual evidence (visual check
for UI changes). What a change needs is decided by `scripts/verify/rules.ts`,
not by judgment: see "The rule" in `docs/verification.md`. Behaviour changes
must ship with a test of the matching kind; when none can express the change,
add a `Verify-Waive: <id>: <reason>` trailer to the commit. Only claim a change
is verified with the report as evidence.

Checks need Postgres (`pnpm db:setup`), Atlas on the PATH and Docker running.
Missing ones show as blocked, never as passed.

## Commits and pull requests

- **No Claude session links.** The repository is public. Never put a
  `Claude-Session:` trailer or a `claude.ai/code/session_…` URL in a commit
  message or PR description. `Co-Authored-By` is fine. Several layers guard this
  (`.claude/settings.json` turns the link off, the commit-msg hook strips the
  trailer, the pre-push hook and CI reject any link), but don't rely on them.
- **Git hooks live in `.githooks/`.** `pnpm install` and a Claude Code
  SessionStart hook enable them. If `git config core.hooksPath` doesn't print
  `.githooks`, run `git config core.hooksPath .githooks` before committing.
