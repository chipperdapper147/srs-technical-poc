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
  review. **Decided 2026-11-11:** explicit learning steps before FSRS (see
  "Squash merges, Auth0, learning steps").
- Map fast exact answers to **Easy**? It would need per-learner timing baselines.
  **Deferred 2026-11-11:** it isn't clear that it is a good idea.
- Prompt direction is fixed (definition → type term); add reverse or
  listening modes later (issue #24).

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
  after CI passes on main is. (Since 2026-11-11 PRs are squash-merged, so
  each push to main is one commit; the tags still mark the ones whose CI
  passed.)
- `release-tag.yml` writes the tags (contents: write, nothing else). It is a
  stand-in. The long-term state, with deploys recorded per environment and
  per unit, is in TODO.md. Until a tag exists the checks use the merge-base,
  as before.

## 2026-11-11: A nightly workflow, not a required check

- `.github/workflows/nightly.yml` (stage 6):
  - flake hunt: e2e × 20, no retries;
  - the other browsers: Firefox, WebKit, Pixel 7, iPhone 15;
  - `pnpm audit --audit-level high`;
  - a canary on Node 26 with every dependency at latest.
- None of it gates a merge. The extra browsers are Playwright projects that
  appear only with `E2E_ALL_BROWSERS=1`, so PR runs stay on Chromium until
  they prove stable.
- The audit level is `high` because the two current findings (low and
  moderate) are in the shadcn CLI's own dependencies; they are in TODO.md.
- The canary upgrades with `pnpm up --latest` in the job only. What breaks
  there becomes a planned upgrade, not an emergency.
- It skips releases under 14 days old (`minimumReleaseAge`). Its question is
  whether the upgrade path is open, which a two-week-old answer settles as
  well as a fresh one. A just-published tarball can 404 for a while (seen
  with `lucide-react` 1.72.0 on #10), and most malicious or broken releases
  are pulled within days.
- The canary runs third-party code nobody pinned, so it is isolated:
  `permissions: {}`, `persist-credentials: false`, no setup-node cache (it
  can't write the store other jobs restore), `--ignore-scripts`, and never
  any secrets.
- The whole repo has a 7-day floor (`minimumReleaseAge: 10080` in
  `pnpm-workspace.yaml`): adding or upgrading a dependency never resolves a
  release younger than a week. Installs from the lockfile are unaffected. An
  urgent security fix can go in `minimumReleaseAgeExclude`, with the reason.

## 2026-11-14: Migrations run in the API's Vercel build

- `apps/api`'s `vercel-build` runs `scripts/deploy/migrate.ts`: `atlas
  migrate apply` on `DATABASE_URL_UNPOOLED`, which the Neon integration
  injects per environment. Production migrates Neon's production branch,
  each preview its own branch, and a failed migration fails the build, so
  the new version never goes live on an unmigrated database.
- Chosen over a GitHub Actions job: no database secret in GitHub, and no
  race between the job and Vercel's own deploy of the same commit.
- Vercel's build has no Docker, so the script downloads Atlas's release
  binary, pinned to the same version as CI and the setup script (a test
  checks) and to a SHA-256 checked before it runs. Off Vercel it does
  nothing.
- `--revisions-schema public`: on Neon, Atlas created its own
  `atlas_schema_revisions` schema but put the table in `public`, then read
  from the schema and failed. Naming the schema keeps both in `public`.
- Expand/contract still holds: the old version keeps serving while the new
  one builds, so every migration must work with both (ADR 0003).

## 2026-11-14: A shared access key until Auth0

- **Why:** the API is about to be public on Vercel, and auth is still the
  dev stub: whoever sends `x-dev-user: <anyone>` acts as that user, and each
  new name creates a user. A deploy would be open to anyone who finds it.
- **The key:** when `API_ACCESS_KEY` is set (Vercel, Sensitive), every
  request must send `Authorization: Bearer <key>`, compared in constant time;
  otherwise 401 before the auth stub runs, so no user is created. `/health`,
  `/docs` and CORS preflights stay open. The API refuses to start on any
  Vercel deploy (`VERCEL_ENV` set) without a key, so it can't go out open.
  Unset locally and in tests, where nothing changes.
- **Not in the web build:** a key compiled into the web app would be
  readable by every visitor. The web app asks for the key on the first 401,
  keeps it in localStorage, and offers "Forget access key". The gate is a
  client port (`AccessGate`, `KeyStorage`), so the Expo app reuses it.
- **Limits:** everyone with the key can still act as any user. Fine while the
  owner is the only holder. Removed when Auth0 lands (TODO, section 7).
## 2026-11-14: The API's tsconfig stands alone

- Vercel builds the API from its root directory, `apps/api`, and typechecks
  it without the repository's `tsconfig.base.json`. Without `strict`, Kysely
  makes every column required on insert, and the first deploy failed on
  `plugins/auth.ts`.
- `apps/api/tsconfig.json` now lists every option itself instead of
  extending the base. `scripts/tsconfig-sync.test.ts` fails when it drifts
  from `tsconfig.base.json`.
- Vercel also compiles each `.ts` file to `.js` without rewriting imports,
  and through `@app/shared`'s `exports` (`./src/index.ts`) the compiled API
  looked for a file it no longer ships. So the API sets
  `rewriteRelativeImportExtensions` and reaches shared only through
  `apps/api/src/shared.ts`, a relative re-export compiled with the API.
  Biome forbids importing `@app/shared` elsewhere in the API; the web app
  keeps the package import.
- Vercel takes `src/app.*` as the entry point before `src/server.*`, so
  the app builder is `src/build-app.ts` and `src/server.ts`, which starts
  the server, is the only candidate (`scripts/deploy/entrypoint.test.ts`).
- Vercel's function loader can't `require()` ES modules (Node 24 can), and
  Swagger UI's `@fastify/static` does. On Vercel the API skips Swagger UI
  and serves `/docs/json` itself; locally `/docs` is unchanged.
  `test/vercel-runtime.test.ts` builds the app with
  `--no-experimental-require-module` to catch such dependencies first.
- Vercel's runtime replaces `http.Server#listen` with a stub that never
  calls back, so `await app.listen()` hung every request. On Vercel,
  `src/server.ts` exports a `(req, res)` handler and doesn't listen.
  `test/vercel-runtime.test.ts` loads it behind the same stub.

## 2026-11-13: The lockfile always passes the release-age floor

- **Why:** pnpm checks the floor again whenever it re-resolves, including
  against packages already locked. One locked release under 7 days old
  blocks every `pnpm add` or upgrade, by anyone, until it ages out. It
  happened once: the floor arrived after a lockfile resolved at latest, and
  pinning `playwright-core` waited two days on 23 such entries.
- pnpm never locks a too-young release by itself, but a lockfile can still
  get one: the floor overridden on the command line, a hand edit, a bot or
  pnpm version that ignores it, or an exclude removed before its release
  aged.
- **Rule:** a change to `pnpm-lock.yaml` or `pnpm-workspace.yaml` must leave
  every locked package at least `minimumReleaseAge` old, excludes aside.
  The `release-age` verify check (`scripts/deps/release-age.ts`) enforces
  it, with the date each offender passes. Releases only get older, so a
  lockfile that passes when it changes can't trip the floor later.
- Unchanged lockfiles are skipped, so the check costs nothing on other
  changes and the leftover entries didn't block unrelated PRs while they
  aged out.

## 2026-11-11: Squash merges, Auth0, learning steps

Decided by the repository owner.

- **Squash merges** (provisional), replacing rebase merges. Each PR lands
  on main as one commit whose message sums up its main ideas. One push to
  main is then one green CI run and one `release/*` tag, which is what the
  compatibility window assumes, and main reads as a list of changes.
- **Auth0 is a requirement**, not one option among others. It is not to be
  replaced by Neon Auth or a similar service.
- **Git hooks stay plain `.githooks/`** (provisional). Whether to move to
  Lefthook is tracked in issue #23.
- **New words get learning steps.** A correct first answer no longer goes
  straight to an FSRS review about 5 days out. New words first pass through
  short explicit steps (for example 10 minutes, then 1 day), then FSRS
  takes over. The steps must be easy to change and loosely coupled to the
  scheduler. This answers the first open question of the trainer entry.
- **Fast answers as Easy: deferred.** It isn't clear that it is a good idea.
- **Follow-up issues:** a hierarchy for the design tokens (#22), reverse and
  listening modes (#24), the mobile app (#25).

## 2026-11-14: A darker `muted-foreground` for AA contrast

Decided by the repository owner (#12), out of three options: a darker
`muted-foreground`, lighter verdict tints, or `foreground` for the
"Next review …" line.

- **Light `muted-foreground` is `oklch(0.525 0 0)` (`#6a6a6a`)**, from
  shadcn's `oklch(0.556 0 0)` (`#737373`). It is the lightest grey that
  reaches 4.5:1 on every surface the token sits on: 5.4:1 on `background`,
  5.0:1 on `muted`, 4.55:1 to 5.0:1 on the verdict tints. The "wrong" tint
  is the tightest. This is the first departure from the stock neutral theme.
- Dark already passed (5.9:1 or more everywhere) and is unchanged.
- The browser axe scan no longer lists the feedback box as a known
  violation, so it enforces this.

## 2026-11-14: Home dashboard

The owner chose the first product idea. Scope: due reviews per course and in
total, one "Review all due" session across courses, and a 7-day forecast.

- **The dashboard is `/`**; the course list moved to `/courses` (header nav
  "Courses", next to "Home" and "Settings").
- **Two additive endpoints.** `GET /dashboard` is the summary: due now per
  course and in total, and the forecast. `GET /study/review` serves the
  mixed session: due items from every course, most overdue first, each with
  its course, language and grading. Answers still go to `POST
  /study/answers`, which grades with the item's own course settings, as
  before. The per-course study endpoint is unchanged.
- **Forecast days are the learner's calendar days.** The client sends its
  IANA time zone (`?timeZone=`, a new `Clock.timeZone()` port; UTC if
  absent) and Postgres buckets `due_at` in it. Today counts every overdue
  review too, so its bar is everything to do by the end of the day.
- **"Review all due" means all of it, up to 100** (the largest limit a study
  request accepts), where a course's review session takes 20. Revisit with
  daily limits and pacing (product idea 5).
- **The study screen serves both sessions.** Its controller takes
  `courseId: null` for all courses; the view model names each item's course
  only in a mixed session, and the answer input's `lang` follows the item.
- **Developer hints follow the build** (#40): an `environment` port
  (`development` under `next dev`, else `production`) reaches the view
  models, which decide whether the empty state mentions `pnpm db:seed`.
## 2026-11-14: Prebuilt courses, inserted once per database

Decided by the repository owner in issue #41; built here.

- **A prebuilt course is an ordinary shared course** (`owner_id` null,
  read-only for learners) whose content lives in the database. Its owner
  can edit or delete it; then it simply changes or ceases to be. Edits
  change nothing for learners: their cards keep pointing at the edited
  items. Deleting content deletes the learner data that points at it.
- **Getting it there:** `apps/api/src/db/prebuilt.ts` lists the courses,
  each with a stable key and a CSV in `db/courses/`. A course is inserted,
  through the CSV import path users get, only while its key is missing from
  the `prebuilt_courses` ledger, and the key is recorded in the same
  transaction. After that it is never inserted again, whether the course
  is edited, renamed or deleted (`course_id` becomes NULL; the row stays).
  Nothing deletes or overwrites. A transaction-level advisory lock on the
  key keeps two deploys of the same database from both inserting.
- **Databases from before the ledger:** with no ledger row but a shared
  course of exactly that title, the step records the key against that
  course instead of inserting a second copy. That covers local databases
  seeded by the first version of this change; production had none.
- **A new key means a new course.** Never change a key; a renamed course
  keeps its old key.
- **It runs everywhere:** on Vercel, `scripts/deploy/migrate.ts` (the API's
  `vercel-build`) runs it right after the migrations, on the same
  `DATABASE_URL_UNPOOLED`: a short batch job needs no pooler, and it needs
  the migrated schema. Either step failing fails the build. Locally,
  `pnpm db:seed` runs it, and CI's e2e job seeds the same way.
- **The Spanish sample stays local:** only `pnpm db:seed` loads it. It is
  recorded in the ledger too (key `spanish-basics-sample`), so a local
  database that deletes it gets it back only if its ledger row goes too.
- **Schema:** `prebuilt_courses (key text PRIMARY KEY, course_id uuid NULL
  REFERENCES courses ON DELETE SET NULL, inserted_at)`, a new table, so an
  expand-only migration. Older API versions never read it.
- **The first course:** the capitals of the 20 most populous countries,
  ranked by the UN World Population Prospects 2024 (the latest edition;
  estimates for 1 July 2023), with English names. Grading already ignores
  accents (unless the learner turns them on), case and punctuation, so
  "Brasilia" and "washington d.c." need no entry. The alternatives are
  other names and spellings: "Washington", "Washington DC" (otherwise one
  edit from "Washington, D.C.", a typo), "Delhi", "Ha Noi", "Teheran" and
  "Metro Manila".
- **Later:** a catalog with search, and who may own and publish prebuilt
  courses (an admin role, once Auth0 is in).

## 2026-11-14: A minimal Expo app; the full one waits for a mobile design

Decided by the repository owner: `apps/mobile` starts minimal, only enough
to prove that the layering of ADR 0002 and the unit boundaries of ADR 0003
hold on React Native. The full app is designed together with a mobile
design shared by the responsive web app and the native app (issue #48),
which supersedes the scope in #25.

- **Scope:** the app shell, the course list and the access-key screen.
  Controllers and view models come from `@app/client` unchanged; the app
  writes only views, screens, routes and `platform/` adapters, as the web
  does.
- **Versions:** Expo SDK 58 (`expo` 58.0.23, published 2026-11-03), React
  Native 0.88.1 (2026-10-27), all pinned exactly and at least 7 days old.
  React stays at the web's 19.3.1, while SDK 58's `bundledNativeModules`
  lists 19.3.0: the two tarballs differ only in their version strings,
  19.3.1 meets React Native's peer range (`^19.3.0`), and React Native's
  renderer has no exact-version check (react-dom has one). One React in the
  workspace means `@app/client/react` and the renderer share it, with no
  Metro or Jest aliasing. `expo install --check` flags the patch; ignore it
  until Expo lists 19.3.1.
- **Layers:** `src/app/` is the root and the router (route in, screen out);
  `src/views/<screen>/` holds `*-view.tsx` (renders `{ vm, actions }`) and
  `*-screen.tsx` (binds with `useScreen`); `src/platform/` provides the
  ports: the API client (base URL from `EXPO_PUBLIC_API_URL`), the access
  gate with the key in the keychain (`expo-secure-store` behind
  `KeyStorage`), the query client, the navigator, the clock (with the time
  zone) and the environment (`__DEV__`). Biome enforces the same import
  rules per layer as on the web, and forbids importing the web app, Next or
  React DOM, so the app stays its own deployable.
- **Navigation, the minimum:** an in-memory stack of platform-neutral routes
  in `platform/navigator.ts`; the shell's destinations start a fresh stack,
  like tabs, and Android's back button pops. Routes without a mobile screen
  show a temporary placeholder, and home shows the course list until the
  dashboard is on mobile. Expo Router or React Navigation comes with the
  full app.
- **Tokens:** views style only through `platform/theme.ts`, built from
  `@app/design`'s TypeScript export. Light theme only, like the web. Geist
  isn't bundled yet (`expo-font`), so the system face stands in.
- **Tests: Jest, not Vitest.** React Native ships Flow sources and its test
  setup is a Jest preset, so the app uses `jest-expo` with React Native
  Testing Library 14. Three adapters let it reuse `@app/client/testing`
  unchanged: `--experimental-vm-modules`, so Jest can `require()` the
  ESM-only msw; `vitest` mapped to Jest's lifecycle hooks; and Node's fetch
  restored, because Expo replaces the global fetch with `expo/fetch`, whose
  native module never answers under Jest. Queries in tests are never
  garbage-collected, or the 5-minute timer would keep Jest's worker alive.
- **Checks:** `test:mobile` (views and screens, RNTL) and `bundle:mobile`
  (`expo export` for iOS: Metro resolves the app, the workspace packages
  and their `.ts` imports, compiled to Hermes bytecode). They run in their
  own CI job, `mobile`, so the other jobs don't wait on them. Changes to the
  client, shared contracts or design tokens run them too: the app consumes
  those units (workspace links standing in for published versions).
- **Visual check without a device:** `pnpm --filter @app/mobile
  preview:web` renders the same native views through react-native-web, for
  screenshots at a phone viewport. React DOM and react-native-web are dev
  dependencies for that; the web is not a target of this app, and the
  preview is no substitute for a simulator or device.
- **Postponed** (issue #48): the remaining screens and the study flow,
  a navigation library, the mobile design, fonts and dark mode, EAS
  builds, store releases and their place in the compatibility window,
  device e2e (Maestro or Detox), push notifications, offline study, Auth0,
  and platform-neutral access-screen copy ("this browser remembers it" is
  the shared view model's text).

## 2026-11-15: Faster import: pasted lists, Quizlet and Anki exports

Built from issue #54 (product idea 6).

- **A new endpoint, `POST /courses/:id/import/rows`,** rather than a
  `format` on the CSV import. It takes `{ unit, rows: [{ term, definition,
  alternatives?, notes? }] }`, already parsed. Why:
  - What the learner previewed is exactly what is imported. With a format
    on the API, the server would parse the text a second time, and in the
    compatibility window (ADR 0003) a client and an API from different
    releases could read the same text differently.
  - New formats (Anki's `.apkg`, a spreadsheet, a share sheet on mobile)
    need no API change: they only have to produce rows.
  - The CSV contract and route stay byte for byte as they were.
  - "The API validates again" is the row contract: each term and
    definition is trimmed, 1–500 characters (`ITEM_TEXT_MAX`, as answers)
    and free of NUL, at most 5,000 rows (`IMPORT_ROWS_MAX`) and a 4 MB body
    (under Vercel's 4.5 MB request limit). It doesn't re-run the format
    parsers: the rows are already structured, and nothing in them is
    trusted beyond being text.
- **The unit is named by title,** as in the CSV import: the words join
  the unit with that title, else a new unit at the end. The screen offers
  the existing units and "New unit"; a new unit's name defaults to the
  picked file's name.
- **Parsers are pure, in `@app/shared` (`import-formats.ts`),** and report
  rejected lines by line number with a reason code; the view model words
  the reason. Detection: Anki when the text opens with Anki's
  `#key:value` header, Quizlet when its rows are separated by semicolons,
  otherwise a word list. A word list's separator is the one of tab,
  " = ", " - " (also an en or em dash) and comma found on the most lines,
  ties in that order, so commas inside definitions don't win. Quizlet's
  default export (tab and newline) reads the same as a word list.
- **Anki:** "Notes in Plain Text" with its header. `#separator:` is
  honoured, the guid, notetype, deck and tags columns are skipped, and the
  first two note fields are term and definition. Fields may be quoted
  (Anki quotes fields holding the separator, a quote or a line break).
  HTML is reduced to text unless `#html:false`; `[sound:…]` references are
  dropped. A header-less export from Anki before 2.1.55 reads as a
  tab-separated word list, without HTML stripping; choosing "Anki" in the
  format select strips it.
- **A swap switch** makes the second field the term. Exports are often
  "English, then the word"; the term is what the learner types.
- **A screen of its own** (`/courses/:id/import`, controller and view model
  in `packages/client/src/import/`), linked from the course page's import
  card. The file picker reads the file in the web view and hands its name
  and text to the controller. The preview shows the first 50 words and the
  first 50 skipped lines, and counts the rest.
- **Not done:** duplicate detection (a word already in the course is
  imported again), `.apkg`, media, several definitions per field,
  scheduling history.

## 2026-11-15: Progress stats

Issue #52 (product idea 4): how a learner is doing, overall and per course.
Built as a `/stats` screen, linked as "Stats" in the header.

- **One additive, read-only endpoint:** `GET /stats?timeZone=&courseId=`.
  Postgres computes every number from `review_logs` and `cards`
  (`apps/api/src/routes/stats.ts`); nothing loads the logs into memory. No
  schema change: `review_logs (user_id, reviewed_at)` serves the per-learner
  scans and `review_logs (item_id)` the per-word counts.
- **Days are the learner's calendar days**, through `Clock.timeZone()` as
  for the dashboard's forecast. The calendar helpers the two share moved to
  `apps/api/src/calendar.ts`.
- **Retention** is the share of correct answers (exact or typo) over the
  last 30 calendar days, today included, counting only answers to words
  that were in FSRS state Review when answered (the log's `revlog` keeps
  that pre-answer state). Learning and relearning answers don't count. The
  sample size is shown with it; with none, it reads "No data".
- **Streaks** are runs of consecutive days with at least one answer, over
  all history. The current streak is the run ending today, or yesterday
  while nothing is answered yet today, so it doesn't drop to zero at
  midnight; a missed whole day ends it.
- **Hardest words** are only words with at least one lapse or wrong
  answer (otherwise a learner with a clean record would see a list of easy
  words), at most 10: most lapses, then the highest share of wrong answers,
  then the most answers, then alphabetical. Wrong answers during the
  learning steps count toward the share.
- **Words learned** counts cards past New (answered at least once), the
  course list's "learned" count. **Reviews done** counts every graded
  answer, learn mode included.
- **Heatmap:** the last 84 days (12 weeks), drawn with plain elements and
  tokens, no chart library: columns are weeks from Monday, and five steps
  of `primary` opacity (none, then quarters of the busiest day). Each day is
  a list item that says its date and count in words.
- **The course filter** is screen state in the controller, not in the URL;
  its options come from the course list query. Revisit if stats links need
  to be shared or bookmarked.

## 2026-11-15: Editing words

The owner chose product idea 2 (#51): a course's owner adds, edits and
deletes its words in the app, and anyone who can see a course can search
it. Reordering items and adding or renaming units stay out of scope.

- **Four additive endpoints.** `GET /courses/:id/items?q=` lists a course's
  words in course order (unit, then position), `POST
  /courses/:id/units/:unitId/items` appends one at the end of its unit
  (max position + 1, with the unit row locked so two adds can't take the
  same position), `PATCH /items/:id` changes only the named fields, and
  `DELETE /items/:id` answers 204. Term and definition are trimmed and
  must not be empty; alternatives are a list of non-empty strings.
- **Only the owner may change a course, and everyone else gets 404**:
  shared and prebuilt courses (`owner_id` null) as well as other learners'
  courses, so an edit endpoint never tells a non-owner what exists. The
  older course endpoints keep their 403 for shared courses; aligning them
  is a possible follow-up.
- **Deleting a word deletes every learner's card and review history for
  it** through the existing `ON DELETE CASCADE`, as decided on #41. The web
  app asks for confirmation first and says so.
- **Search uses grading's normaliser.** `itemMatchesSearch` in
  `@app/shared` (`search.ts`) compares with `normalizeAnswer(text, false)`:
  case, accents, punctuation and extra spaces ignored, matching a
  substring of the term, definition or any alternative (not notes). The
  API's `?q=` filters with it after loading the course's items, and the
  client filters the loaded list with it as you type, so both agree and
  typing needs no request per keystroke. Courses are small; filter in SQL
  if they stop being.
- **A screen of its own: `/courses/:id/words`** (`words` controller and
  view model in `@app/client`, route `{ to: "words" }`), linked from the
  course page as "Search and edit words" (owner) or "Search words". The
  word list is its own query under the course key (`["courses", id,
  "items"]`), so invalidating the course also refreshes it; a change
  invalidates every course query and the dashboard.
- **One form at a time**, either adding to a unit or editing a word in
  place. Alternatives are typed one per line. A new word can only go into
  an existing unit, so an empty course still starts with a CSV import.
- **CORS now allows DELETE.**
- **The confirm button uses the primary variant**, not shadcn's
  `destructive`: its red text on the red tint is 4.0:1 at button size,
  below AA. Worth a look in the redesign (#48).

## 2026-11-15: Course catalog and "Copy to my courses"

Built for issue #53, which follows the owner's "a catalog with search"
from #41.

- **The catalog is the shared courses** (`owner_id` null, so the prebuilt
  ones too), at `GET /catalog?q=&targetLang=`: title, description,
  languages and word count, sorted by title, at most 50 (`CATALOG_LIMIT`;
  no pagination yet). `q` is a case-insensitive substring of the title or
  the description, with `%` and `_` taken literally; `targetLang` matches
  the tag case-insensitively. The response also lists every target
  language in the catalog, whatever the filters, so the client can offer
  the language filter without a second request.
- **Search runs on submit, the language filter on change.** No
  search-as-you-type: no debounce timers in the controller, and the same
  behaviour on mobile. The previous results stay on screen while the next
  ones load (`keepPreviousData`).
- **`POST /courses/:id/copy` returns the new course** (201, the course
  detail). One transaction of three set-based `INSERT … SELECT`s: the
  course with its settings (description, languages, grading overrides),
  its units, then its items, each joined to its new unit by position. The
  copy has no cards or history and shares no rows with the source, so
  either side can change or be deleted without touching the other.
  `apps/api/src/copy-course.ts`.
- **Only shared courses can be copied** (403 for your own course, 404 for
  someone else's private one): publishing your own courses waits for
  Auth0.
- **The copy keeps the source's title,** and copying twice makes two
  copies. No `copied_from` column, so no schema change: the UI doesn't
  say "Copied from …" yet, and the catalog doesn't mark courses you have
  already copied.
- **The catalog is its own screen** (`/catalog`, `packages/client/src/catalog/`),
  linked from the header ("Catalog") and from the course list ("Browse the
  catalog"). The course list is unchanged otherwise. Each catalog card's
  title opens the shared course, read-only, to look before copying. After
  a copy, the controller refreshes the course list and the dashboard and
  opens the copy through the `Navigator` port.

## 2026-11-15: Study aids: hints, "I was right", undo last answer

Issue #55 (product idea 7, plus two common SRS conveniences). The API
decides all three; `apps/api/src/srs.ts` stays the only place that schedules.

- **Hints reveal the term one letter at a time.** Letters are the term's
  characters other than whitespace (after NFC), so "la biblioteca" takes 12
  hints and the space comes along for free. `POST /study/answers` takes an
  optional `hints` count (additive); the API clamps it to the term's letters
  and rates with `ratingForAnswer` in `@app/shared`: any hint caps the rating
  at Hard, every letter makes it Again, even for an exact answer. An Again
  answer is re-queued in the session as a wrong one is (the session now
  re-queues on rating 1, not on the `wrong` verdict). Hints reveal the main
  term, never an alternative.
- **"I was right"** (`POST /study/answers/:id/override`, `:id` the
  `reviewId` every answer result now carries) is offered on a wrong or typo
  verdict while its feedback shows. It rates the answer as an exact one would
  be: Good, or Hard after hints. The API refuses it (409) when that wouldn't
  raise the rating (a hinted typo, the whole word hinted), for an exact
  answer, a second time, for anything but the learner's latest answer, and
  after the window below.
- **Override recomputes from the card before the answer**, with ts-fsrs's
  own `rollback` on the stored revlog (`scheduler.rollback` in `srs.ts`),
  then a review with the new rating at the answer's original time. The
  review log row stays: `verdict` and `answer` stay the grader's,
  `rating` and `revlog` become the recomputed review, and the new
  `overridden_at` says when. Stats count an overridden answer as correct.
- **Undo** (`POST /study/answers/:id/undo`) restores the card to exactly its
  state before the answer, again through `rollback`; for a first answer the
  card row is deleted, so the word is new again. **The review log entry is
  deleted**, not marked: an undone answer never happened as far as
  scheduling goes, keeping it would make every reader of `review_logs`
  (stats, a future FSRS re-fit) filter it out, and older API versions in the
  window wouldn't know to. An API test compares the card row before and after.
- **Only the latest answer, within 10 minutes** (`ANSWER_WINDOW_MINUTES`),
  for both override and undo: the learner's newest review log row across
  all courses, so the mixed "Review all due" session works the same.
- **The client offers undo from anywhere in the session**, including the
  summary, once: the session state machine keeps the latest answer's review
  id and the session just before it (one deep), and goes back there. The
  controller waits for an override or undo before moving on, and drops the
  offer when the API answers 409 (too late, not the latest). It doesn't
  hide the button when the window runs out; the API's message says why.
- **Schema (expand only):** `review_logs.hints smallint NOT NULL DEFAULT 0`
  and `review_logs.overridden_at timestamptz NULL`. Older API versions
  insert without them and never read them. The rehearsal seed now has
  hinted and overridden answers, and the "rating matches verdict" invariant
  allows for hints and overrides.
- **Compatibility:** `reviewId` and `overridden` are optional in the
  contract although the API always sends them, so a client still works
  against an API from before this change (a rollback), only without
  override and undo.
- **Not built:** the optional "Add my answer as an alternative" after an
  override. The item endpoints from "Editing words" make it a small client
  change for courses the learner owns.

## 2026-11-15: playwright-core is pinned next to @playwright/test

- **Why:** the nightly canary moves every exact pin to its newest release at
  least 14 days old. It moved `@playwright/test` back to an older mature
  release while the lockfile kept the newer `playwright-core` it had pinned,
  and that failed the canary's floor. `apps/e2e` now pins `playwright-core`
  directly, so the canary moves both; `scripts/deps/playwright-pin.test.ts`
  keeps the two pins equal.
- **The canary skips unpublished and deprecated versions.** npm's `time`
  still lists unpublished versions (`test-renderer` 28.0.0) and the
  accidentally published `react-native` 1000.0.0 is only deprecated, so
  `scripts/canary/upgrade.ts` now takes versions from `versions` and skips
  deprecated ones.
- **Not solved by this:** transitive packages locked between 7 and 14 days
  old (since #49, several in the Expo tree, such as `@expo/log-box` and
  `metro-*`) still fail the canary's 14-day floor. Pinning can't reach them.
