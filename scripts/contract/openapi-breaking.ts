/**
 * Check `openapi-breaking`: does this change break clients of the API as it
 * is deployed? For each version in the compatibility window (production and
 * the rollback target, scripts/compat/window.ts), `oasdiff breaking` compares
 * that version's apps/api/openapi.json with the head copy and fails on its
 * errors: a removed path or response field, a newly required request field, a
 * narrowed type. Warnings are printed but pass.
 *
 * A break made on purpose goes in apps/api/openapi-breaking.ignore, one line
 * per accepted error as oasdiff prints it ("GET /me response property ..."),
 * with the reason in the PR. Prefer expand/contract instead: add the new
 * field or path, move clients, then remove the old one.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compatibilityWindow, describe } from "../compat/window.ts";
import { ROOT } from "../schema/change.ts";

const SPEC = "apps/api/openapi.json";
const IGNORE = "apps/api/openapi-breaking.ignore";

process.chdir(ROOT);
const window = compatibilityWindow();
if (window.length === 0) {
  console.log(
    "openapi-breaking: no release tags and no base ref (shallow clone?); nothing to compare",
  );
  process.exit(0);
}
const work = mkdtempSync(join(tmpdir(), "srs-openapi-"));
let failed = 0;
try {
  for (const version of window) {
    const old = spawnSync("git", ["show", `${version.sha}:${SPEC}`], { encoding: "utf8" });
    if (old.status !== 0) {
      console.log(`openapi-breaking: ${describe(version)} has no ${SPEC}; nothing to compare`);
      continue;
    }
    const oldFile = join(work, `${version.sha}.json`);
    writeFileSync(oldFile, old.stdout);
    const args = ["breaking", oldFile, SPEC, "--fail-on", "ERR"];
    if (existsSync(IGNORE)) args.push("--err-ignore", IGNORE);
    console.log(`openapi-breaking: ${SPEC} at ${describe(version)} → head`);
    const r = spawnSync("oasdiff", args, { stdio: "inherit" });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      failed++;
      console.log(
        `openapi-breaking: FAILED for ${describe(version)}. Its clients would break. Make the change additive (expand/contract), rebase if main changed the API since this branch, or accept the break in ${IGNORE} and say why in the PR.`,
      );
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed > 0 ? 1 : 0);
