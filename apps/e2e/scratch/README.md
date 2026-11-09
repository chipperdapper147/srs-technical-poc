# Scratch specs

Throwaway Playwright specs for the **agent visual check** (see
`docs/verification.md`). Everything in this folder except this README is
git-ignored.

Use them to drive a flow you are changing, take screenshots at the states that
matter, and look at them. Nothing here runs in `pnpm e2e` or in CI.

## Run

```sh
pnpm dev                                    # optional: reuse running servers
pnpm e2e:scratch                            # every spec in scratch/
pnpm e2e:scratch scratch/typo-feedback.spec.ts
```

Screenshots you save go where you point them; by convention use
`scratch/out/`. Traces and automatic per-test screenshots land in
`scratch/test-results/` (`pnpm --filter @app/e2e exec playwright show-trace <zip>`
needs a display).

## Template

Same fixtures and page objects as the real suite, so a flow is a few lines:

```ts
// scratch/typo-feedback.spec.ts
import { test } from "../support/fixtures.ts";
import { WORDS_CSV } from "../support/words.ts";

test("typo feedback looks right", async ({ api, page, studyPage }) => {
  const courseId = await api.createCourse({ csv: WORDS_CSV });
  await studyPage.goto(courseId, "learn");
  while ((await studyPage.nextStep()) === "present") await studyPage.copyWord();
  await studyPage.answer("la biblioteka");
  await page.screenshot({ path: "scratch/out/typo-feedback.png" });
});
```

## Static pages

For a single screen with no interaction, the CLI is quicker:

```sh
pnpm --filter @app/e2e exec playwright screenshot --full-page \
  http://localhost:3000/settings scratch/out/settings.png
# also: --device "iPhone 15", --color-scheme dark, --wait-for-selector <sel>
```

The CLI uses Playwright's own downloaded browser (`playwright install chromium`)
and ignores `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. On a machine with a preinstalled
Playwright, its global `playwright` binary works too, as long as that version
matches its browsers.

## Promote or delete

If a scratch flow guards behaviour that would be costly to break silently,
move it to `tests/`, replace the screenshots with assertions, and commit it.
Otherwise delete it.
