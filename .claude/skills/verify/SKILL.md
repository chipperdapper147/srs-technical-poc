---
name: verify
description: Verify the current change in this repo before claiming it works (verification stage 2). Runs `pnpm verify` for the diff against main, does the manual evidence it asks for (agent visual check for UI changes, OpenAPI and lockfile review), and reports with evidence. Use at the end of any task that changed code, before committing or opening a PR, or when asked to verify, check or test a change.
---

# /verify

The rules live in `scripts/verify/rules.ts` and are explained in
`docs/verification.md`. Don't decide by feel what a change needs: the runner
decides, you supply what it can't automate.

## 1. Preconditions

```sh
git config core.hooksPath            # must print .githooks
pnpm db:setup                        # Postgres up, migrated, seeded (idempotent)
```

If Postgres, Atlas or Docker is unavailable, checks that need them show as
**blocked**. Fix the environment if you can; otherwise report them as blocked.
Never `--skip` a check just to get green: `--skip` is for checks that can't
run here (no browser, no Docker), with that reason.

## 2. Plan and run

```sh
pnpm verify plan                     # read it: classes, checks, obligations, evidence
pnpm verify --report /tmp/verify-report.md
```

- A failing check is a real failure: fix the code (or the stale generated
  file a drift check names, by committing the regenerated copy), then rerun.
- A **missing obligation** means the change needs a kept test of that kind.
  Write it. Waive only when no test can express the change (a pure rename,
  styling only), with a trailer on the commit:
  `Verify-Waive: <id>: <specific reason>`. For uncommitted work:
  `pnpm verify --waive <id>="<reason>"`.
- If the plan looks wrong for the change (a file in a surprising class, specs
  missing from the e2e map), say so and propose a `rules.ts` change; don't
  work around it.

## 3. Manual evidence

Do every item under "Manual evidence still needed".

**`visual-check`** (agent visual check, `docs/verification.md`):

1. `pnpm dev` in the background, or let `pnpm e2e:scratch` start the servers.
2. Static screens: `pnpm --filter @app/e2e exec playwright screenshot --full-page <url> scratch/out/<name>.png`
   (add `--device "iPhone 15"` for mobile). In cloud sessions the CLI may
   lack its browser; use a scratch spec instead.
3. Flows and interactive states: a spec in `apps/e2e/scratch/` using the
   fixtures and page objects (template in `apps/e2e/scratch/README.md`),
   run with `pnpm e2e:scratch scratch/<name>.spec.ts`. Capture desktop and
   mobile, and listen for console errors (`page.on("console", ...)`).
4. Open every screenshot and look at it. Describe what you saw, not what you
   expected to see.
5. Promote the scratch spec into `apps/e2e/tests/` only if it guards
   behaviour that would be costly to break silently; otherwise leave it in
   scratch (git-ignored).

**`openapi-review`**: `git diff main -- apps/api/openapi.json`. Removed paths,
removed or newly required request fields, removed or narrowed response
fields are breaking. State whether the change is breaking.

**`lockfile-review`**: `git diff main -- pnpm-lock.yaml`. List new packages
and major bumps; check package.json versions are exact.

**`ci-run`**: push and link the CI run once it's green.

## 4. Report

Follow the reporting rule in `docs/verification.md`:

- the `pnpm verify` report (checks with results and times, obligations,
  waivers);
- screenshots for each visual check, with what you observed;
- the OpenAPI or lockfile verdict if asked for;
- everything skipped or blocked, and why.

Claim "verified" only if every check passed, every obligation is met or
waived with a reason, and every evidence item is done. Otherwise say exactly
what is missing.
