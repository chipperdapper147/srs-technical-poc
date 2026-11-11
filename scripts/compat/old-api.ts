/**
 * Check `compat-old-api`: each deployed API version in the window
 * (production and the rollback target, window.ts) still passes its own
 * integration tests on the schema this change migrates to. That is the
 * situation during a rollout (the database is migrated first) and after an
 * API rollback (migrations are not rolled back). Expand/contract is meant to
 * make it hold; this proves it for each change.
 *
 * For each version it runs only when this change adds migrations that
 * version doesn't have (otherwise that API runs on its own schema, which its
 * CI tested), or when the compatibility tooling itself changes.
 */

import { changedSince, compatibilityWindow, describe, migrationsSince } from "./window.ts";
import {
  dropDb,
  loadLocalEnv,
  recreateDb,
  run,
  urlFor,
  useHeadMigrations,
  withWorktree,
} from "./worktree.ts";

const window = compatibilityWindow();
if (window.length === 0) {
  console.log(
    "compat-old-api: no release tags and no base ref (shallow clone?); nothing to compare",
  );
  process.exit(0);
}
const DB = "srs_compat_api";
let failed = 0;
let envLoaded = false;
for (const version of window) {
  const added = migrationsSince(version.sha);
  // A change to the compatibility tooling runs it anyway, so CI exercises it.
  const selfTest = changedSince(version.sha).some((p) => p.startsWith("scripts/compat/"));
  if (added.length === 0 && !selfTest) {
    console.log(
      `compat-old-api: ${describe(version)}: no new migrations; it already ran on this schema`,
    );
    continue;
  }
  if (!envLoaded) loadLocalEnv();
  envLoaded = true;
  console.log(
    `compat-old-api: the API of ${describe(version)} against ${added.length} new migration(s)${added.length ? `: ${added.join(", ")}` : ""}`,
  );
  const status = await withWorktree(version.sha, (dir) => {
    useHeadMigrations(dir);
    recreateDb(DB);
    try {
      // That version's tests' global setup applies the (now head) migrations to this database.
      return run("pnpm", ["--filter", "@app/api", "test"], {
        cwd: dir,
        env: { ...process.env, TEST_DATABASE_URL: urlFor(DB) },
      });
    } finally {
      dropDb(DB);
    }
  });
  if (status !== 0) {
    failed++;
    console.log(
      `compat-old-api: FAILED for ${describe(version)}. That API breaks on the new schema, so this migration would break it during the rollout or after a rollback. Make it an expand step (see "Database changes" in docs/verification.md).`,
    );
  }
}
process.exit(failed > 0 ? 1 : 0);
