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
  other CI job (`commit-messages`, `pr-description`, `obligations`,
  `static`, `database`, `e2e`) passed, so later job splits never touch the
  ruleset.
- [ ] **Merge settings** (Settings → General → Pull Requests): allow squash
  merging only (decided 2026-11-11, see `docs/decisions.md`); merge commits
  and rebase merging off. Allow auto-merge, always suggest updating PR
  branches, and delete head branches automatically.
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

- [ ] **Confirm plain `.githooks/`** as the hook manager: provisionally
  confirmed on 2026-11-11 (`docs/decisions.md`). Whether to adopt Lefthook
  is tracked in issue #23.

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

## 5. Verification mechanisms

Grouped by the stages in `docs/verification.md`. Each new check lands in
`scripts/verify/rules.ts` (a `Check`, plus the classes that require it), so
`pnpm verify`, CI and the docs pick it up together.

### Rules follow-ups

- [ ] **Grow the e2e map** as specs are added (`E2E_MAP` in rules.ts); an
  unmapped file runs the whole suite, which is safe but slow once the suite
  grows.

### Missing test kinds (stage 3)

- [ ] **Screenshot diffs** of each screen, beside the axe browser scans
  (`apps/e2e/tests/a11y.spec.ts`).
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
- [ ] **Record deployed versions (long-term desired state).** Today the
  window is approximated: every commit on main whose CI passed gets a
  `release/*` tag (`.github/workflows/release-tag.yml`), and the
  compatibility checks treat the newest tag as production and the one
  before as the rollback target. That assumes every green main commit
  deploys, to one environment, as one unit. The desired state:
  - the deploy pipeline records each deploy, per environment (preview,
    staging, production) and per deployable unit (API, web, later each
    mobile release still supported in the stores);
  - production and the rollback target are read from those records, not
    from git tags, so a failed or skipped deploy never counts as deployed;
  - a rollback updates the record, so the window follows what actually runs;
  - each unit is published as a versioned artifact (see "Versioned
    consumption"), and the checks run those artifacts rather than worktrees
    of commits.

  Until then, release tags are the source; the deploy job writes them
  instead of the CI-success workflow once the deploy exists (section 4).
- [ ] **Compatibility-window test:** `compat-old-api` runs the API tests of
  production and the rollback target (release tags) on the migrated schema.
  Extend it to every consumer of the database, from published artifacts,
  once the two items above exist.
- [ ] **When is it safe to contract?** Today `contract-readiness` is written
  evidence. Decide how consumers publish what they use (for example a usage
  manifest per release) so readiness can be checked automatically.
- [ ] **HTTP API compatibility with deployed clients**: `openapi-breaking`
  (oasdiff) and `compat-old-client` cover the web app of production and the
  rollback target (release tags). Once deployed versions are recorded, cover
  every deployed client version (web, and each supported mobile release).
  Also: tolerant parsing of enums in clients.
- [ ] **Rehearse on a branch of production** (Neon) instead of generated data,
  with the deploy. Also set `lock_timeout` and `statement_timeout` on the
  deploy's migration connection (Squawk's per-file timeout rules are off for
  that reason).
- [ ] **In a setup with Atlas Pro**, replace Squawk: the `migration-lint`
  command becomes `atlas migrate lint --git-base <base>`, and `.squawk.toml`
  goes.

### Merge gate and beyond (stages 4–7)

Not blocked, can start now:

- [ ] **Cross-browser e2e in the merge gate**: Firefox, WebKit and the
  mobile projects run nightly (`.github/workflows/nightly.yml`). Move them
  into `ci.yml` once they have been stable for a while.
- [ ] **axe scans on Firefox**: `apps/e2e/tests/a11y.spec.ts` skips the
  Firefox project because Firefox's content process crashes inside `axe.run`
  on the settings screen. That is a browser crash, not a violation: the
  investigation is on PR #10, and the functional specs pass on Firefox.
  Remove the skip after a Playwright or Firefox upgrade and check the
  nightly `browsers (firefox)` job.
- [ ] **Audit findings below `high`**, both in the shadcn CLI's own
  dependencies (`apps/web > shadcn`): `minimatch` <11.0.1 (moderate,
  GHSA-g3hv-75wg-m249, through ts-morph) and `deepmerge` 4.2–4.3.1 (low,
  GHSA-gcqx-w48m-w2h4, no patch). Clear them with a shadcn upgrade or a
  `pnpm.overrides` entry for minimatch, then lower the nightly
  `--audit-level`.

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
  change `packages/design/tokens.json`, and republish the artifact. The
  palette and fonts are the owner's choice; the token hierarchy they go
  into is issue #22.
- [ ] **Contrast gaps** flagged in the token notes: `muted-foreground` on
  `muted` (4.3:1, light) and the focus `ring` (2.6:1, light). The browser
  axe scan also finds `muted-foreground` on the verdict tints in the study
  feedback box ("Next review …", 3.98 to 4.39:1). It is listed as known in
  `apps/e2e/support/a11y.ts`; remove that entry with the fix.
- [ ] **Dark theme is unreachable**: defined in tokens, but nothing sets
  `.dark`. Follow the OS setting, or add a toggle in Settings.

## 7. Product

- [ ] **Auth0 integration:** replace the dev stub in
  `apps/api/src/plugins/auth.ts` and the web client, and remove the shared
  access key (`plugins/access-key.ts`, the client's `AccessGate` and the web
  access screen; decisions log, 2026-11-14). Auth0 is required, not
  to be replaced by Neon Auth or similar (decided 2026-11-11). This unblocks
  the Auth0 mock, real integration and the environment secrets.
- [ ] **Reverse and listening modes** (issue #24).
- [ ] **Mobile app** (issue #25); its verification is under "Missing test
  kinds" above.
- Candidate features that aren't chosen yet are in
  [`docs/product-ideas.md`](docs/product-ideas.md); they aren't TODOs.
- Open product questions are tracked in
  [`docs/decisions.md`](docs/decisions.md#open-questions). The learn-session
  interval is decided (learning steps); mapping fast answers to Easy is
  deferred.
