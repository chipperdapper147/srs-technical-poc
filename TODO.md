# TODO

Follow-up work, roughly in the order it unblocks other work. The verification
items come from [`docs/verification.md`](docs/verification.md), which stays the
source of truth for the target state. When an item is done, update its row
under "Where we are today" there and delete it here.

## 1. GitHub setup (unblocks the merge gate)

Done by hand in the repo's Settings, as `chipperdapper147` (admin).

- [ ] **Ruleset on `main`** (Settings → Rules → Rulesets): target the default
  branch. Restrict deletions, block force pushes, require linear history.
  Require a pull request with 0 approvals (you can't approve your own PR).
  Require the status check `check` only, and require branches to be up to
  date before merging. `check` is an aggregate job that fails unless every
  other CI job (`commit-messages`, `obligations`, `static`, `database`, `e2e`)
  passed, so later job splits never touch the ruleset.
- [ ] **Merge settings** (Settings → General → Pull Requests): squash merging
  only. Allow auto-merge, always suggest updating PR branches, and delete head
  branches automatically.
- [ ] **Actions** (Settings → Actions → General): read-only workflow token.
  Require approval for fork PR workflows from all outside collaborators.
- [ ] **Merge queue** (stage 4): GitHub offers it only on organization-owned
  repos (confirm in settings). Either transfer the repo to an organization, or
  rely on "up to date before merging" plus auto-merge.
- [ ] **Environments** `preview` and `production`, holding the Auth0 and deploy
  secrets, with `production` limited to `main`. Blocked on the deploy setup
  (section 4) and the Auth0 integration (section 7).

## 2. Housekeeping after the move

- [ ] When section 1 is done, update the status in
  [ADR 0001](docs/adr/0001-dedicated-repository.md) and the "Branch
  protection" row in `docs/verification.md`.

## 3. Decisions needed

- [ ] **Confirm plain `.githooks/`** as the hook manager (decided provisionally
  on 2026-11-09, see `docs/decisions.md`; reverse it if lefthook is wanted).

## 4. Deploy (Vercel Hobby + Neon)

Decided on 2026-11-11 (decisions log). Needs accounts and secrets, so each
step starts with something only the repo owner can do.

- [ ] **Vercel projects** for `apps/web` and `apps/api` (owner: create them and
  connect the repository).
- [ ] **Trial the API on Vercel.** Open risks: Fastify's zero-config detection
  with our build-free TypeScript (`.ts` run directly, `@app/shared` as source),
  the entry point (`server.ts` calls `listen()`), and a smaller connection pool
  on Neon's pooled URL.
- [ ] **Migrations from CI against Neon**, with the direct
  (`DATABASE_URL_UNPOOLED`) URL as a GitHub environment secret. Cloud agent
  sessions can't reach Neon over TCP, so this runs only in CI.
- [ ] **A Neon branch per preview deploy**, so stage 4 runs against a copy of
  production. This also replaces the generated rehearsal data (ADR 0003).
- [ ] **Setup script:** install the Neon CLI and pull `.env.neon` in cloud
  sessions (the API key is already saved on the environment).

## 5. Verification mechanisms

Grouped by the stages in `docs/verification.md`. Each new check lands in
`scripts/verify/rules.ts` (a `Check`, plus the classes that require it), so
`pnpm verify`, CI and the docs pick it up together.

### Rules follow-ups

- [ ] **Waivers from the PR description.** Today waivers are commit trailers
  only. With squash merges, also accepting `Verify-Waive:` lines in the PR
  body would read more naturally; needs the PR body in the `obligations` job
  (`github.event.pull_request.body`, passed via an env var, not inlined).
- [ ] **Manual evidence in CI.** The report lists owed evidence but nothing
  checks it was supplied. Option: a PR template with one checkbox per
  evidence id, and the `obligations` job fails on unchecked boxes.
- [ ] **Grow the e2e map** as specs are added (`E2E_MAP` in rules.ts); an
  unmapped file runs the whole suite, which is safe but slow once the suite
  grows.

### Missing test kinds (stage 3)

- [ ] **Accessibility checks in the browser** (`@axe-core/playwright`): axe
  already scans every view in jsdom; a browser pass adds colour contrast and
  real layout. Screenshot diffs later.
- [ ] **Mobile app** (`apps/mobile`, Expo): views, screens and `platform/`
  adapters over `@app/client` (ADR 0002). Add `mobile-*` classes to the rules.
- [ ] **Auth0 mock** for local and PR runs: sign test tokens with a local key.
  Needs the Auth0 integration first.

### Across repositories (ADR 0003)

Principles are decided (compatibility window, expand/contract, every
unit treated as its own repository); these details are open.

- [ ] **Versioned consumption between units.** Units publish versions and
  consumers pin exact ones, instead of workspace links. Proposal to evaluate:
  changesets for versions, a local registry (Verdaccio) in CI and dev.
- [ ] **Record deployed versions** per environment: production and the rollback
  candidate, per consumer. Needs the deploy pipeline.
- [ ] **Compatibility-window test:** run each consumer version in the window
  (its database-facing tests, from its published artifact) against the
  migrated schema. Depends on the two items above.
- [ ] **When is it safe to contract?** Today `contract-readiness` is written
  evidence. Decide how consumers publish what they use (for example a usage
  manifest per release) so readiness can be checked automatically.
- [ ] **HTTP API compatibility with deployed clients** (web, and every supported
  mobile version): an automated breaking-change check against what's deployed.
  `oasdiff` (compares two OpenAPI documents and labels breaking changes) is
  one option, not a decision. Includes tolerant parsing of enums in clients.
- [ ] **Rehearse on a branch of production** (Neon) instead of generated data,
  with the deploy. Also set `lock_timeout` and `statement_timeout` on the
  deploy's migration connection (Squawk's per-file timeout rules are off for
  that reason).
- [ ] **In a setup with Atlas Pro**, replace Squawk: the `migration-lint`
  command becomes `atlas migrate lint --git-base <base>`, and `.squawk.toml`
  goes.

### Merge gate and beyond (stages 4–7)

Not blocked, can start now:

- [ ] **Stage 6, nightly workflow** (`schedule:` in a second workflow): flake
  hunting (`pnpm e2e --repeat-each 20`), the full browser matrix, `pnpm audit`,
  and a canary build on Node 26, TypeScript 7 and the latest dependencies.
- [ ] **Cross-browser e2e** (Firefox, WebKit, mobile viewport) as Playwright
  projects. Run them nightly first; move them into the merge gate once
  they are stable.

Blocked on the deploy setup (section 4) and the Auth0 integration:

- [ ] **Stage 4, merge gate:** deploy a preview and run the real-integration
  smoke with real Auth0. Run migrations on a production-like copy of the data.
- [ ] **Stage 5, post-deploy:** smoke e2e against staging, then production.
  Check the migration result.
- [ ] **Stage 7, production:** error tracking and a synthetic check of the
  study flow.

## 6. Design

- [ ] **A product identity.** The design system documents shadcn's stock
  neutral theme. Decide a palette, a display face and the verdict colours,
  change `packages/design/tokens.json`, and republish the artifact.
- [ ] **Contrast gaps** flagged in the token notes: `muted-foreground` on
  `muted` (4.3:1, light) and the focus `ring` (2.6:1, light).
- [ ] **Dark theme is unreachable**: defined in tokens, but nothing sets
  `.dark`. Follow the OS setting, or add a toggle in Settings.

## 7. Product

- [ ] **Auth0 integration:** replace the dev stub in
  `apps/api/src/plugins/auth.ts` and the web client. This unblocks the Auth0
  mock, real integration and the environment secrets.
- Open product questions (the learn-session review interval, mapping fast
  answers to Easy, reverse and listening modes) are tracked in
  [`docs/decisions.md`](docs/decisions.md#open-questions).
