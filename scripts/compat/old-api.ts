/**
 * Check `compat-old-api`: the API as it is at the base (the stand-in for
 * production and the rollback candidate, ADR 0003) still passes its own
 * integration tests on the schema this change migrates to. That is the
 * situation during a rollout (the database is migrated first) and after an
 * API rollback (migrations are not rolled back). Expand/contract is meant to
 * make it hold; this proves it for each change.
 *
 * Runs only when the change adds migrations (otherwise the base API runs on
 * the base schema, which the base commit's own CI already tested), or when
 * the compatibility tooling itself changes.
 */
import { schemaChange } from "../schema/change.ts";
import {
  dropDb,
  loadLocalEnv,
  recreateDb,
  run,
  urlFor,
  useHeadMigrations,
  withBaseWorktree,
} from "./worktree.ts";

const change = schemaChange();
if (!change) {
  console.log("compat-old-api: no base ref (shallow clone?); nothing to compare");
  process.exit(0);
}
// A change to the compatibility tooling runs it anyway, so CI exercises it.
const selfTest = change.changed.some((p) => p.startsWith("scripts/compat/"));
if (change.added.length === 0 && !selfTest) {
  console.log(
    `compat-old-api: no new migrations since ${change.ref}; the base API already ran on this schema`,
  );
  process.exit(0);
}
loadLocalEnv();
const DB = "srs_compat_api";
const base = change.base.slice(0, 8);
console.log(
  `compat-old-api: the API at ${base} (${change.ref}) against ${change.added.length} new migration(s): ${change.added.join(", ")}`,
);
const status = await withBaseWorktree(change, (dir) => {
  useHeadMigrations(dir);
  recreateDb(DB);
  try {
    // The base tests' global setup applies the (now head) migrations to this database.
    return run("pnpm", ["--filter", "@app/api", "test"], {
      cwd: dir,
      env: { ...process.env, TEST_DATABASE_URL: urlFor(DB) },
    });
  } finally {
    dropDb(DB);
  }
});
if (status !== 0) {
  console.log(
    `compat-old-api: FAILED. The API at ${base} breaks on the new schema, so this migration would break production during the rollout or after a rollback. Make it an expand step (see "Database changes" in docs/verification.md).`,
  );
}
process.exit(status);
