/**
 * `playwright-core` is pinned directly in apps/e2e, next to `@playwright/test`,
 * so the nightly canary's upgrade (scripts/canary/upgrade.ts) moves both
 * together. Without the direct pin, the canary moved `@playwright/test` to an
 * older mature release while the lockfile kept its newer `playwright-core`,
 * which then failed the canary's 14-day floor (ERR_PNPM_NO_MATURE_MATCHING_VERSION).
 * `@playwright/test` depends on exactly its own `playwright-core` version, so
 * the two pins must stay equal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const e2e = JSON.parse(
  readFileSync(new URL("../../apps/e2e/package.json", import.meta.url), "utf8"),
) as {
  devDependencies: Record<string, string>;
};

describe("playwright pins", () => {
  it("pin playwright-core to the same version as @playwright/test", () => {
    const test = e2e.devDependencies["@playwright/test"];
    const core = e2e.devDependencies["playwright-core"];
    assert.ok(test, "@playwright/test is a devDependency of apps/e2e");
    assert.equal(core, test, "bump @playwright/test and playwright-core together");
  });
});
