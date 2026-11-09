# Verification strategy

**Status:** target state. Parts are in place today (see the bottom of this
file). This is the basis for a future `/verify` skill.

Goal: a clearly defined way to show, at every stage from first edit to
production, that a change works as intended and broke nothing else.

## Three axes

Every check sits somewhere on three axes. Local and CI verification differ
mainly in where they sit, not in tooling.

| Axis           | One end                                                                                                             | Other end                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Permanence** | _Throwaway_: written to convince yourself during a change, never committed (a scratch script, a curl, a screenshot) | _Kept_: committed to the suite and run forever as regression protection         |
| **Scope**      | _Targeted_: the code and flows the change touches                                                                   | _Complete_: the whole suite, as close to full coverage as is realistic          |
| **Realism**    | _Heuristic_: boundaries mocked or stubbed, dev servers, one browser                                                 | _Realistic_: production build, real dependencies and services, several browsers |

- **Local work** leans throwaway, targeted and heuristic: fast feedback while
  building.
- **CI and merge gates** lean kept, complete and realistic: proof nothing
  regressed.
- **Promote, don't accumulate.** When a throwaway check proves a behaviour
  that would be costly to break silently, turn it into a kept test. Otherwise
  let it go. Not every check belongs in the suite; suite bloat is a cost.

## Mocked vs real integration

Draw the line at what we control:

- **Never mock Postgres.** It runs in a throwaway Docker container and is
  fast. Most of the logic lives in SQL, so a fake database mainly tests the fake.
- **Mock what we don't control** in local and PR runs: Auth0 (sign test tokens
  with a local key), and the API when testing frontend components on their own.
- **Real integration** means the real Auth0 tenant, a deployed environment and
  the real network. It needs secrets, is slower and flakier, and runs only at
  the merge gate and after deploy.

## Test kinds, by side

The frontend and the backend are different environments, so their tiers differ.

| Kind                       | Backend (`apps/api`, `packages/shared`)                                             | Frontend (`apps/web`)                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Static                     | Biome, `tsc`                                                                        | Biome, `tsc`, `next build`                                                      |
| Unit                       | Grading, FSRS mapping, CSV parsing (Vitest)                                         | Session state machine and other pure logic (Vitest)                             |
| Property-based             | Grading and normalization invariants (fast-check)                                   | —                                                                               |
| Mocked integration         | Routes via `app.inject` with auth stubbed, against Docker Postgres                  | Components against a mocked API (Testing Library + MSW)                         |
| Contract                   | Zod contracts in `@app/shared`; OpenAPI diff against the base branch                | Same contracts parse every response                                             |
| Schema                     | Atlas validate and drift check; codegen drift; migration linter for locking hazards | —                                                                               |
| Local integration (Docker) | API + Postgres together, seeded                                                     | Playwright over the full local stack                                            |
| Visual / UX                | —                                                                                   | Agent visual check (below); later axe accessibility checks and screenshot diffs |
| Real integration           | Against a deployed preview with real Auth0                                          | Playwright smoke against the preview                                            |

## The agent visual check

A throwaway verification method used during development. It can be done by
the coding agent or by a person: change something, look at it, report what you
saw. Pick the tool by what you need to see.

| What you're checking                                                              | Tool                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A static page, or one screen in a variant (mobile, dark mode)                     | Playwright CLI: `playwright screenshot`                            |
| A flow, or a state reached by interacting (typing an answer, finishing a session) | Throwaway spec in `apps/e2e/scratch/`, run with `pnpm e2e:scratch` |
| A flow worth guarding permanently                                                 | Promote the spec into `apps/e2e/tests/`                            |

**Steps:**

1. Run the app (`pnpm dev`), or let `pnpm e2e:scratch` start it.
2. **Static pages:**
   `pnpm --filter @app/e2e exec playwright screenshot --full-page <url> scratch/out/<name>.png`.
   Useful options: `--device "iPhone 15"`, `--color-scheme dark`,
   `--wait-for-selector <selector>`. The CLI only loads a URL; it can't click
   or type.
3. **Flows:** write a spec in `apps/e2e/scratch/`, which is git-ignored apart
   from its README. It uses the same fixtures and page objects as the real
   suite, so a flow is a few lines. It also saves screenshots wherever you
   point them (convention: `scratch/out/`), records a trace, and starts the
   servers if they aren't running. The scratch config is separate:
   `pnpm e2e` and CI never run these specs. Template: `apps/e2e/scratch/README.md`.
4. Collect console errors, and query the database or API if the change
   persists data.
5. Look at the screenshots and report what was checked, with the evidence.
6. **Promote or delete.** Move a scratch spec into `tests/` (screenshots
   replaced by assertions) only if it guards behaviour that would be costly to
   break silently.

**Why not a standalone script:** the first UI screenshots of the prototype
came from a hand-written script using the plain `playwright` library, before
the page objects existed. Scratch specs replace that approach: they reuse the
page objects, give traces on failure, and promoting one is just moving the
file.

## Stages

| #   | Stage                                          | Runs                                                                                                                                                                                                                                                            | Axes                                         | Target time |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------- |
| 0   | **Inner loop** (every edit)                    | Typecheck and unit tests for affected packages, editor formatting                                                                                                                                                                                               | targeted, heuristic, kept                    | seconds     |
| 1   | **Pre-commit** (optional hook)                 | Biome on staged files                                                                                                                                                                                                                                           | targeted                                     | < 5 s       |
| 2   | **Local verify** (end of a task; `/verify`)    | Lint, typecheck, all unit and mocked-integration tests, Docker integration tests; `db:check` and codegen if the schema changed; e2e specs for the touched flows; agent visual check for UI changes (CLI screenshots, scratch specs); throwaway checks as needed | targeted, mostly heuristic, kept + throwaway | 1–2 min     |
| 3   | **CI on every PR push**                        | Everything in stage 2 except throwaway checks, at full scope: full e2e on the production build, accessibility, OpenAPI diff posted on the PR. Parallel jobs.                                                                                                    | complete, realistic-ish, kept                | < 5 min     |
| 4   | **Merge gate** (required checks / merge queue) | Cross-browser e2e (Chromium, Firefox, WebKit, mobile viewport); deploy a preview and run the real-integration smoke (real Auth0); migrations on a production-like data copy                                                                                     | complete, realistic                          | ~10 min     |
| 5   | **Post-deploy**                                | Smoke e2e against staging, then production; check the migration result                                                                                                                                                                                          | realistic                                    | minutes     |
| 6   | **Nightly**                                    | Flake hunting (each test repeated many times); full browser matrix; dependency audit; canary build on upcoming versions (Node 26, TypeScript 7, latest deps)                                                                                                    | complete                                     | unbounded   |
| 7   | **Production**                                 | Error tracking; a synthetic check of the study flow                                                                                                                                                                                                             | realistic                                    | continuous  |

Stages 4–5 need a dedicated repository and a deploy target; see
[ADR 0001](adr/0001-dedicated-repository.md).

## Which checks a change needs

| Change touches                                 | Also required                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `db/schema.sql`                                | `pnpm db:diff`, `db:migrate`, `db:codegen`, `db:check`; a test exercising the new column or constraint |
| Contracts (`packages/shared/src/contracts.ts`) | Both sides typecheck; review the OpenAPI diff for breaking changes                                     |
| Grading or scheduling                          | Unit tests (property tests once available); e2e grading specs                                          |
| UI                                             | e2e specs for the screen (page objects updated); agent visual check                                    |
| API route                                      | Integration test via `app.inject`; e2e if user-visible                                                 |
| Dependencies                                   | Full stage-3 run; check the lockfile diff                                                              |

## Reporting rule

Verification is only claimed with evidence:

- the commands run and their results;
- screenshots for UI changes;
- explicitly what was skipped and why.

## Where we are today

| Area                                                                        | Status                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| Static checks, unit tests (shared, web), API integration on Docker Postgres | ✅                                              |
| Atlas drift guard, codegen drift check                                      | ✅                                              |
| Playwright e2e with page objects                                            | ✅ local and in CI (Chromium, production build) |
| Agent visual check                                                          | ✅ practised; not yet a documented skill        |
| Frontend mocked integration (MSW)                                           | ❌                                              |
| Property-based tests                                                        | ❌                                              |
| OpenAPI diff                                                                | ❌                                              |
| Accessibility checks                                                        | ❌                                              |
| Migration linter for locking hazards                                        | ❌                                              |
| Pre-commit hook                                                             | ❌                                              |
| Parallel CI jobs                                                            | ❌ (one serial job, ~2 min)                     |
| Merge gate, preview deploys, real integration, post-deploy, nightly         | ❌ blocked on ADR 0001                          |
| `/verify` skill                                                             | ❌ to be written from this document             |
