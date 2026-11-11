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

## 2026-11-09: Agent environment setup lives in the repo

- **One idempotent script, `scripts/setup-agent-env.sh`**, run by a
  committed SessionStart hook in cloud sessions (`CLAUDE_CODE_REMOTE=true`).
  Locally the hook only sets `core.hooksPath`, as before. The script pins
  Node (checksum-verified tarball) and Atlas (extracted from its official
  image, the same version CI pins), starts Docker if needed, installs
  dependencies only when a manifest changed, and brings Postgres up,
  migrated and seeded. Measured here: 12 s from cold with Docker images
  cached, about 10 s more to pull them, 3 s warm.
- **Why a hook, not the cloud environment's setup script:** the hook is
  versioned and reviewed with the code it sets up, runs on every session
  start and resume (containers can be replaced on resume), and is the same
  for every environment a session might use. An environment setup script
  is per-account settings, invisible in the repo, and drifts.
- **Synchronous** on purpose: the first turn can rely on `pnpm verify`
  working. Switch to async (`{"async": true}`) only if startup latency hurts.

## 2026-11-09: Neon project linked; its credentials stay out of `.env`

- Neon project `muddy-field-12956530` (Postgres 18, eu-central-1) is linked
  with the Neon CLI (`.neon`, git-ignored). Its connection strings are in
  `.env.neon` (git-ignored): `DATABASE_URL` (pooled) and
  `DATABASE_URL_UNPOOLED` (direct, for migrations).
- `neon init` pulls variables into the existing `.env`, replacing the local
  `DATABASE_URL`; with that in place, `pnpm dev`, seeding, `pnpm verify` and
  the e2e suite would run against production. `.env` keeps only local
  databases, and `pnpm verify` blocks database checks when `DATABASE_URL`
  or `TEST_DATABASE_URL` is not local.
- No `neon.ts`: its packages (`@neon/config`, `@neon/env`) aren't needed for
  connection strings. Add it when we declare Neon services or branch
  policies (e.g. per-preview branches).
- Claude Code cloud containers only allow outbound HTTPS, so Postgres over
  TCP to Neon fails there; Neon's HTTPS SQL endpoint works. Migrations and
  deploy-time database work go in CI or Vercel.

## 2026-11-09: Screens are controller, view model, view

- [ADR 0002](adr/0002-client-architecture.md). Every screen's logic and text
  moved into `@app/client` (controllers on `@tanstack/query-core`, pure view
  models); web views only render. Expo will reuse the package. Biome's
  `noRestrictedImports` enforces each layer's imports; `rules.ts` has
  `client-*`, `web-view` and `web-route` classes with their own obligations.
  `@tanstack/react-query` is gone from the web app.
- **MSW fake API** (`@app/client/testing`): stateful, grades with the shared
  grader, fixtures parsed by the contracts. Writing it found a real bug:
  `UpdateCourseSchema` was a partial of the create schema, and Zod 4 applies
  defaults inside a partial, so changing a course's accents erased its
  description and grading override. Fixed in the contract, with an API test.
- **axe in jsdom** found that progress bars had no accessible name; view
  models now carry a label for each.
- msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; the old name is
  silently ignored, so `setupFakeApi` uses the new one and unhandled requests
  fail the test.

## 2026-11-10: Design system in the repo; tokens.json is the one source

- **`@app/design` (`packages/design`)** holds `tokens.json`, in the Design
  System artifact's format. `pnpm design:build` generates the web's CSS
  variables (`apps/web/src/app/tokens.css`, imported by `globals.css`, which
  no longer holds values) and a typed module for Expo
  (`packages/design/src/tokens.ts`: colours converted from oklch to hex,
  because React Native has no `oklch()`; sizes in dp). Both are committed and
  drift-checked like the OpenAPI snapshot.
- **The switch is exact.** Old and new stylesheets were compiled and compared
  in a browser: 82 computed values in both themes, 0 differences. The
  verdict colours, Tailwind literals in `study-view.tsx` until now, became
  `verdict-*` tokens with the same values.
- **The artifact's docs live in `packages/design/system/`**;
  `pnpm design:system` assembles the publishable files, including a live
  component bundle. The bundle is built from ESM only: the preview frame
  supplies React 18 as globals (React 19 has no UMD build), so `react`,
  `react-dom` and the JSX runtime resolve to generated ESM modules whose
  export lists come from `Object.keys` of the installed packages.
- The system documents the UI as it is: shadcn's stock neutral theme. A
  product identity (palette, display face) is a separate decision (TODO).

## 2026-11-10: Verify as if every package were its own repository

- [ADR 0003](adr/0003-verification-across-repositories.md): mechanisms are
  designed for separate repositories, which is the real setup; changes to the
  database must not break consumer versions in the compatibility window
  (production, rollback candidate, deployment candidate); database changes go
  by expand and contract, without versioned views.
- **Migration lint: Squawk, standing in for Atlas Pro.** `atlas migrate lint`
  needs a paid login; the real setup has it. Squawk (`squawk-cli`, a free
  Postgres migration linter) runs in its place on the migrations a change adds,
  configured in `.squawk.toml`. Swapping back is one command in `rules.ts`.
  Rules off: `prefer-robust-stmts` (Atlas runs each file in a transaction),
  the bigint style rules, and the per-file timeout rules (the deploy's
  connection sets timeouts).
- **Expand/contract is enforced on the SQL** (`scripts/schema/classify.ts`),
  separately from the linter: Squawk judges locking, the policy judges
  compatibility with running versions. When it is safe to contract is still
  written evidence (`contract-readiness`).
- **Rehearsal on generated data** until there is a production branch to use:
  writing it showed that a UNIQUE on duplicate terms, a SET NOT NULL over
  existing NULLs, and a backfill that breaks the rating/verdict pairing all
  pass on an empty database and fail here.

## 2026-11-11: Deploy target: Vercel Hobby and Neon

- **Vercel Hobby** hosts both apps as separate projects: the Next.js web app
  (server features included), and the Fastify API as a Vercel Function
  (Vercel supports Fastify without configuration). Each pull request gets a
  preview deploy of both, which is what the merge gate (verification stage 4)
  runs against.
- **Neon** hosts Postgres 18 (project `muddy-field-12956530`, eu-central-1).
  Its branches give each preview, and later each migration rehearsal, a copy
  of production.
- Hobby is for personal, non-commercial use. A product with revenue moves to
  Vercel Pro.
- Risks to settle in a trial before relying on it, and the steps that need
  the owner's accounts and secrets: `TODO.md`, section 4. This closes the
  open question in ADR 0001.

## 2026-11-11: PR descriptions are checked for session links too

- The PR-creation tool appended a `claude.ai/code/session_…` footer to every
  pull request description so far; it was removed by hand each time. CI's
  `pr-description` job (`scripts/check-pr-description.sh`) now fails on one
  in the title or description, with the same patterns as commit messages.
- CI also runs on `edited` pull-request events, so fixing the description
  re-runs it. The whole workflow repeats rather than only that job: skipping
  jobs on an edit would let a green `check` from the edit replace a red one
  from the same commit.

## 2026-11-11: Waivers and manual evidence in the PR description

- CI's `obligations` job reads the PR description (`VERIFY_PR_BODY`, passed
  as data). Its `Verify-Waive:` lines count like commit trailers, which reads
  more naturally than amending commits.
- Each evidence item now says when it is due. Items due `pr` must be ticked
  in the description (`- [x] \`<id>\``, one box per item in
  `.github/pull_request_template.md`), or the job fails. `design-publish`is
  due after merge and only listed;`ci-run`is met by the green`check`.
- A ticked box is the author's attestation, with what they did beside it.
  CI can't judge a screenshot, but it can make sure nobody forgot one.

## 2026-11-11: oasdiff checks the API for breaking changes

- `openapi-breaking` runs `oasdiff breaking` between the base branch's
  `apps/api/openapi.json` and the head copy, and fails on its errors. It runs
  for every change to the API spec, routes, domain or contracts, and in CI's
  `static` job.
- oasdiff is pinned (v1.34.1) and taken from its official image, as Atlas is.
- The base branch stands in for the deployed clients until deployed versions
  are recorded (ADR 0003).
- Intended breaks go in `apps/api/openapi-breaking.ignore`, with the reason
  in the PR. The default is expand/contract, as for the database.
- `openapi-review` stays for what a structural diff can't see.

## 2026-11-11: The old API is tested on the new schema

- `compat-old-api` checks out the base commit in a git worktree, swaps in
  the change's migrations, and runs that API's integration tests. The base
  stands in for production and the rollback candidate until deployed
  versions are recorded (ADR 0003).
- It runs when a change adds migrations, locally through `pnpm verify` and
  in CI's `database` job.
- It turns "expand/contract keeps old versions working" from a policy into
  a test. It also checks the API part of `contract-readiness`: a contract
  migration passes only once the base API no longer uses what it removes.

## 2026-11-11: The old web app is tested against the new API

- `compat-old-client` builds the base commit's web app for the head API,
  runs the head API on a scratch database (head migrations and seed), and
  runs the base commit's e2e specs against them.
- The base stands in for the client already loaded in users' browsers. The
  web app and the API deploy separately, so a new API always serves old
  clients for a while.
- It runs when a change touches the API, the shared contracts or the
  schema, in CI's `e2e` job (Chromium only). oasdiff checks the contract's
  shape; this checks behaviour.

## 2026-11-11: The window is production and the rollback target, from release tags

- The compatibility checks run against the two newest `release/*` tags
  (production and the rollback target), not the merge-base alone. The
  deployment candidate is the change itself.
- With rebase merges one PR lands as several commits, and only some get a
  green CI run, so "the previous commit" isn't a release. A tag written
  after CI passes on main is.
- `release-tag.yml` writes the tags (contents: write, nothing else). It is a
  stand-in. The long-term state, with deploys recorded per environment and
  per unit, is in TODO.md. Until a tag exists the checks use the merge-base,
  as before.
