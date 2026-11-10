/**
 * Check `migration-lint`: the migrations this change adds, against its base
 * (VERIFY_BASE, else origin/main, else main), like `atlas migrate lint --git-base`.
 *
 *  1. Squawk (stand-in for Atlas Pro's linter, see .squawk.toml): locking and
 *     safety hazards. A finding fails the check unless the statement carries a
 *     `-- squawk-ignore <rule>` comment that says why.
 *  2. The expand/contract policy (classify.ts): contract statements only in
 *     contract migrations, which ship alone and without code changes; one-step
 *     breaking changes never; applied migrations never edited.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { ROOT, schemaChange } from "./change.ts";
import { checkPolicy } from "./classify.ts";

const change = schemaChange();
if (!change) {
  console.log("migration-lint: no base ref (shallow clone?); nothing to compare against");
  process.exit(0);
}
const { ref, base, added: addedPaths, modified, changed } = change;
process.chdir(ROOT);

if (addedPaths.length === 0 && modified.length === 0) {
  console.log(`migration-lint: no new migrations since ${ref} (${base.slice(0, 8)})`);
  process.exit(0);
}
console.log(
  `migration-lint: ${addedPaths.length} new migration(s) since ${ref}: ${addedPaths.join(", ")}`,
);

// 1. Squawk
let failed = false;
if (addedPaths.length > 0) {
  const squawk = spawnSync(
    "pnpm",
    ["exec", "squawk", "--config", ".squawk.toml", "--reporter", "json", ...addedPaths],
    {
      encoding: "utf8",
    },
  );
  const findings = JSON.parse(squawk.stdout || "[]") as {
    file: string;
    line: number;
    rule_name: string;
    message: string;
  }[];
  // Squawk's own contract-type rules are judged by the expand/contract policy below.
  const policyRules = new Set([
    "ban-drop-column",
    "ban-drop-table",
    "adding-not-nullable-field",
    "renaming-column",
    "renaming-table",
    "changing-column-type",
    "adding-required-field",
  ]);
  for (const f of findings) {
    if (policyRules.has(f.rule_name)) continue; // judged (with a remedy) by the policy below
    failed = true;
    console.log(
      `  ${f.file}:${f.line + 1}: [${f.rule_name}] ${f.message} (https://squawkhq.com/docs/${f.rule_name})`,
    );
  }
  if (squawk.status !== 0 && findings.length === 0) {
    console.error(squawk.stderr);
    process.exit(2);
  }
}

// 2. Expand/contract policy
const result = checkPolicy({
  added: addedPaths.map((path) => ({ path, sql: readFileSync(path, "utf8") })),
  modified,
  changed,
  matches: (p, globs) => globs.some((g) => matchesGlob(p, g)),
});
for (const e of result.errors) console.log(`  ${e}`);
for (const n of result.notes) console.log(`  note: ${n}`);
if (result.contract && result.errors.length === 0) {
  console.log(
    "  contract migration: report contract-readiness evidence (no consumer version in the compatibility window uses what it removes; ADR 0003)",
  );
}
failed ||= result.errors.length > 0;
console.log(failed ? "migration-lint: FAILED" : "migration-lint: ok");
process.exit(failed ? 1 : 0);
