/**
 * Check `openapi-breaking`: does this change break clients of the API as it
 * is at the base (the stand-in for production until deployed versions are
 * recorded, ADR 0003)? `oasdiff breaking` compares the base commit's
 * apps/api/openapi.json with the head copy and fails on its errors: a removed
 * path or response field, a newly required request field, a narrowed type.
 * Warnings are printed but pass.
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
import { ROOT, schemaChange } from "../schema/change.ts";

const SPEC = "apps/api/openapi.json";
const IGNORE = "apps/api/openapi-breaking.ignore";

process.chdir(ROOT);
const change = schemaChange();
if (!change) {
  console.log("openapi-breaking: no base ref (shallow clone?); nothing to compare");
  process.exit(0);
}
const base = spawnSync("git", ["show", `${change.base}:${SPEC}`], { encoding: "utf8" });
if (base.status !== 0) {
  console.log(`openapi-breaking: ${SPEC} does not exist at the base; nothing to compare`);
  process.exit(0);
}
const work = mkdtempSync(join(tmpdir(), "srs-openapi-"));
try {
  const baseFile = join(work, "base.json");
  writeFileSync(baseFile, base.stdout);
  const args = ["breaking", baseFile, SPEC, "--fail-on", "ERR"];
  if (existsSync(IGNORE)) args.push("--err-ignore", IGNORE);
  console.log(`openapi-breaking: ${SPEC} at ${change.base.slice(0, 8)} (${change.ref}) → head`);
  const r = spawnSync("oasdiff", args, { stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.log(
      `openapi-breaking: FAILED. Clients built against ${change.ref} would break. Make the change additive (expand/contract), or accept the break in ${IGNORE} and say why in the PR.`,
    );
  }
  process.exit(r.status ?? 1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
