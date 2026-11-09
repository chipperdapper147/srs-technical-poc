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
  Require status checks `check` and `commit-messages`, and require branches to
  be up to date before merging.
- [ ] **Merge settings** (Settings → General → Pull Requests): squash merging
  only. Allow auto-merge, always suggest updating PR branches, and delete head
  branches automatically.
- [ ] **Actions** (Settings → Actions → General): read-only workflow token.
  Require approval for fork PR workflows from all outside collaborators.
- [ ] **Merge queue** (stage 4): GitHub offers it only on organization-owned
  repos (confirm in settings). Either transfer the repo to an organization, or
  rely on "up to date before merging" plus auto-merge.
- [ ] **Environments** `preview` and `production`, holding the Auth0 and deploy
  secrets, with `production` limited to `main`. Blocked on the deploy target
  (section 3) and the Auth0 integration (section 5).

## 2. Housekeeping after the move

- [ ] Limit CI's `push` trigger to `main`. Today every PR runs CI twice (once
  for `push`, once for `pull_request`).
- [ ] When section 1 is done, update the status in
  [ADR 0001](docs/adr/0001-dedicated-repository.md) and the "blocked on ADR
  0001" row in `docs/verification.md`.

## 3. Decisions needed

- [ ] **Deploy target** (Vercel / Fly / Railway / other), an open question in
  ADR 0001. It decides whether preview environments, and the real-integration
  tier that runs against them, are possible.
- [ ] **Hook manager:** lefthook, plain `.githooks/`, or CI-only enforcement
  (ADR 0001). `.githooks/` already holds the session-link guards. The stage-1
  Biome hook goes wherever this lands.

## 4. Verification mechanisms

Grouped by the stages in `docs/verification.md`.

### Local (stages 1–2)

- [ ] **`/verify` skill**, written from `docs/verification.md`. It runs stage 2
  for the touched area and reports with evidence, following the reporting rule.
  It includes the agent visual check, which is practised but not yet written up
  as a skill.
- [ ] **Pre-commit hook:** Biome on staged files, under 5 s. Depends on the
  hook-manager decision.

### Missing test kinds (stage 3)

- [ ] **Property-based tests** (fast-check) for grading and normalization
  invariants.
- [ ] **Frontend mocked integration:** components against a mocked API
  (Testing Library + MSW).
- [ ] **OpenAPI diff** against the base branch, posted on the PR.
- [ ] **Accessibility checks** (axe), and screenshot diffs later.
- [ ] **Migration linter** for locking hazards. `atlas migrate lint` needs
  Atlas Pro, so find a free alternative or extend `scripts/db-check.sh`.
- [ ] **Auth0 mock** for local and PR runs: sign test tokens with a local key.
  Needs the Auth0 integration first.

### CI shape (stage 3)

- [ ] **Parallel CI jobs:** split the single serial `check` job (~2 min now;
  target under 5 min once the checks above are added). Update the ruleset's
  required checks when job names change.

### Merge gate and beyond (stages 4–7)

Blocked on the deploy target and the Auth0 integration.

- [ ] **Stage 4, merge gate:** cross-browser e2e (Chromium, Firefox, WebKit,
  mobile viewport). Deploy a preview and run the real-integration smoke with
  real Auth0. Run migrations on a production-like copy of the data.
- [ ] **Stage 5, post-deploy:** smoke e2e against staging, then production.
  Check the migration result.
- [ ] **Stage 6, nightly:** flake hunting (each test repeated many times), the
  full browser matrix, a dependency audit, and a canary build on Node 26,
  TypeScript 7 and the latest dependencies.
- [ ] **Stage 7, production:** error tracking and a synthetic check of the
  study flow.

### Session-link guard

- [ ] Optional: a CI check that PR descriptions contain no Claude session
  links. Today only `attribution.sessionUrl` and the `AGENTS.md` rule cover PR
  descriptions.

## 5. Product

- [ ] **Auth0 integration:** replace the dev stub in
  `apps/api/src/plugins/auth.ts` and the web client. This unblocks the Auth0
  mock, real integration and the environment secrets.
- Open product questions (the learn-session review interval, mapping fast
  answers to Easy, reverse and listening modes) are tracked in
  [`docs/decisions.md`](docs/decisions.md#open-questions).
