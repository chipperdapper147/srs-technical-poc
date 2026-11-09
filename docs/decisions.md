# Decisions

Stack and design decisions for the prototype, newest last. Annotate rather
than delete when a decision is reversed.

## 2026-11-09: Initial stack

| Area                         | Decision                                                               | Notes                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo                         | pnpm workspaces + Turborepo                                            | `apps/api`, `apps/web`, `packages/shared`                                                                                                                       |
| Node                         | **24 LTS**                                                             | Node 26 became LTS in Oct 2026 but is weeks old; 24 is one LTS behind and supported to Apr 2028. 22 (EOL Apr 2027) ruled out. Bump via `.nvmrc`, `engines`, CI. |
| Postgres                     | **18**                                                                 | Released Sep 2025 and patched (18.x); gives built-in `uuidv7()` for primary keys.                                                                               |
| TypeScript                   | **6.0**, not 7.0                                                       | 7.0 is the Go-native compiler; Next.js type-checks through the classic JS API. Revisit once Next supports TS 7.                                                 |
| Schema                       | Atlas, versioned migrations generated from declarative `db/schema.sql` | `atlas migrate lint` now requires an Atlas login (Pro), so CI uses `scripts/db-check.sh`: `migrate validate` plus a no-op `migrate diff` drift check.           |
| DB access                    | Kysely + `kysely-codegen`                                              | Atlas owns the schema; types are generated from the migrated DB and CI fails if they drift. Ruled out Prisma/Drizzle (second schema source of truth).           |
| API                          | Fastify 5 + Zod (`fastify-type-provider-zod`)                          | Contracts in `@app/shared`, OpenAPI generated from them at `/docs`. TypeBox ruled out: less ergonomic on the frontend.                                          |
| Web                          | Next.js 16 App Router, Tailwind 4, shadcn/ui, TanStack Query           | shadcn's current default style (`base-nova`) is built on Base UI rather than Radix.                                                                             |
| Lint/format                  | Biome                                                                  | Next 16 removed `next lint`; one fast tool for the whole repo.                                                                                                  |
| Tests                        | Vitest                                                                 | API tests run against a real Postgres (`srs_test`) via `app.inject`.                                                                                            |
| No build step for API/shared | Node 24 type stripping runs `.ts` directly                             | Requires `erasableSyntaxOnly` (no enums, namespaces or parameter properties) and `.ts` import extensions.                                                       |
| Auth                         | Dev stub now, **Auth0 next**                                           | Every request resolves `request.user` from `users.auth_sub`; dev mode uses `dev                                                                                 | local`or the`x-dev-user`header. Auth0's free plan should be enough for a prototype; swapping in JWT verification only touches`apps/api/src/plugins/auth.ts` and the web client. |

## 2026-11-09: First tool: typed-recall vocabulary trainer

- **Content model:** course (source/target BCP 47 language tags) → units → items
  (`term` typed by the learner, `definition` prompt, `alternatives`, `notes`).
  Courses without an owner are shared and read-only; users create their own and
  import CSV.
- **Scheduler:** FSRS via `ts-fsrs` v6 with library defaults (FSRS-7 model,
  fuzz on). The `cards` table mirrors the v6 card fields; each review stores the
  raw ts-fsrs revlog as `jsonb` so parameters can be re-fitted per learner later.
- **Grading** (`packages/shared/src/grading.ts`), configurable per user with
  per-course overrides:
  - _lenient_ (default): normalized comparison (case, punctuation and whitespace
    ignored), with a small edit-distance allowance (0 for ≤3 chars, 1 for ≤7, 2
    beyond) graded as **typo**.
  - _strict_: normalized exact match only.
  - _accent-sensitive_ toggle (default off).
  - Ratings: exact → Good, typo → Hard, wrong → Again. Easy is unused for now.
- **Session flow:** learn mode presents each new word (typed once to copy, not
  graded), then quizzes them; review mode quizzes due cards. Wrong answers are
  re-queued up to 2 times per session. The API grades every answer; the
  client's copy of the grader only checks the ungraded copy step.

### Open questions

- A correct first answer at the end of a learn session schedules the next
  review about **5 days** out (FSRS-7 defaults skip learning steps). Memrise-style
  apps review new words within hours. Options: `allowModelOverride: false` with
  explicit learning steps, or make the learn-session quiz not count as an FSRS
  review.
- Map fast exact answers to **Easy**? It would need per-learner timing baselines.
- Prompt direction is fixed (definition → type term); add reverse or
  listening modes later.

## 2026-11-09: Atlas pinned, Playwright e2e with page objects

- **Atlas pinned to v1.3.8 in CI.** The installer's `latest` resolves to canary
  builds (`v1.3.9-…-canary` at the time), which is not what we want gating CI.
- **Playwright** (`apps/e2e`, `@playwright/test` 1.65) using the page object
  model: one class per screen in `pages/`, fixtures in `support/fixtures.ts`
  that hand each test its page objects, an `api` client for fast setup, and a
  unique learner identity so tests are isolated and run in parallel against
  one database. `support/db.ts` is the only direct DB access (time travel for
  review tests).
- In CI, e2e runs against `next start` (production build), the real API and
  Postgres. Locally it reuses `pnpm dev` if it is already running.
- Writing the suite caught a real bug: invalidating `["courses"]` at the end of a
  session also refetched the session itself (its key started with `courses`),
  which replaced the summary with the empty state. Study queries now use a
  `["study", …]` key.

## 2026-11-09: Dedicated repository and verification strategy

- [ADR 0001](adr/0001-dedicated-repository.md): the prototype moves to its own
  repository. Merge gates, branch protection, preview deploys and secrets need it.
- [Verification strategy](verification.md): target state for checks at every
  stage, organised along three axes (kept vs throwaway, targeted vs complete,
  heuristic vs realistic). A `/verify` skill will be written from it.

## 2026-11-09: No Claude session links in commits

The repository is public, so `Claude-Session:` trailers and claude.ai session
URLs must never reach it. They were stripped from the history carried over from
the old branch. No single guard covers every case, so there are several:

- `AGENTS.md` states the rule (`CLAUDE.md` now just imports `AGENTS.md`).
- `.claude/settings.json` sets `attribution.sessionUrl: false`. Cloud sessions
  with several repositories, or inside a project, don't read repo settings,
  so this alone isn't enough.
- `.githooks/commit-msg` strips the trailer and rejects other session URLs.
  `.githooks/pre-push` rejects them in anything being pushed, which covers
  commits that skipped commit-msg. `pnpm install` (`prepare`) and a Claude Code
  SessionStart hook set `core.hooksPath`.
- CI's `commit-messages` job checks the whole history. Once branch protection
  exists, make it a required check.

Plain `.githooks/` was chosen over a hook manager to keep the lefthook question
in ADR 0001 open. If lefthook is adopted, move both hooks into it.

## 2026-11-09: Verification rules as code

- **Change classes.** Every changed path falls in exactly one class (first
  match in `scripts/verify/rules.ts`); a class lists the checks it needs,
  whether e2e runs for mapped specs or the whole suite, the test
  obligations, and the manual evidence. Unmatched paths, dependencies and
  tooling require the full run. `pnpm verify` computes this from the diff
  and runs it; the tables in `docs/verification.md` are generated from the
  same file and drift-checked.
- **Obligations instead of coverage thresholds.** "A route change ships
  with an API test change" is checkable from the diff alone and fails
  loudly; coverage percentages reward the wrong tests. The escape hatch is
  an explicit `Verify-Waive: <id>: <reason>` commit trailer, so every
  exception is written down.
- **One runner for local and CI.** CI jobs call `pnpm verify --all --only
  …`, so a check has one command definition. A single aggregate `check` job
  is the required status check, so jobs can be split without touching
  branch protection.
- **OpenAPI snapshot instead of a posted diff.** `apps/api/openapi.json` is
  generated from the Zod contracts and committed, with a drift check.
  Contract changes show up as a normal PR diff; no PR-comment token needed.
  Breaking-change detection is by review for now (TODO).
- **Hook manager: plain `.githooks/`** (provisional, answers the open
  question in ADR 0001). The pre-commit Biome hook joins the existing
  commit-msg and pre-push hooks; pre-push also checks obligations. One
  hook per stage doesn't need a manager. Revisit if hooks multiply.
- **Property-based tests** (fast-check) for grading. They found that the
  verdict depended on the order of equally close alternatives (`abcx`
  against `abc|abcd` was wrong, against `abcd|abc` a typo). Fixed: on a
  tie the candidate that allows the typo wins.
