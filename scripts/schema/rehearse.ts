/**
 * Check `migration-rehearsal`: apply this change's migrations to a database
 * that looks like production, the way the deploy will.
 *
 *  1. A scratch database gets the BASE commit's migrations and the base
 *     commit's production-shaped data (db/rehearsal/seed.sql at the base).
 *  2. Each new migration is applied in order and timed; one over
 *     REHEARSAL_MAX_SECONDS (default 20) fails, as does any error (a NOT NULL
 *     or UNIQUE that existing rows violate, a bad backfill).
 *  3. Every invariant in db/rehearsal/invariants/*.sql must return no rows.
 *  4. The head copy of seed.sql must apply to the head schema, so the next
 *     change can rehearse on top of this one.
 *
 * Stand-in for rehearsing on a branch of the production database (Neon); see
 * ADR 0003. Local Postgres only: refuses non-local DATABASE_URLs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remoteDatabases } from "../verify/plan.ts";
import { git, ROOT, schemaChange } from "./change.ts";

process.chdir(ROOT);
// Variables from the repo .env, without overriding what is set (as scripts/with-env.sh).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const remote = remoteDatabases(process.env);
if (remote.length > 0) throw new Error(`refusing a non-local database: ${remote.join(", ")}`);
const admin = process.env.DATABASE_URL;
if (!admin) throw new Error("DATABASE_URL is not set");
const urlFor = (db: string) => {
  const u = new URL(admin);
  u.pathname = `/${db}`;
  return u.toString();
};
const MAX_SECONDS = Number(process.env.REHEARSAL_MAX_SECONDS ?? 20);
const SCALE = process.env.REHEARSAL_SCALE ?? "1";

const change = schemaChange();
if (!change) {
  console.log("migration-rehearsal: no base ref (shallow clone?); nothing to rehearse");
  process.exit(0);
}
const seedChanged = change.changed.includes("db/rehearsal/seed.sql");
if (
  change.added.length === 0 &&
  !seedChanged &&
  !change.changed.some((p) => p.startsWith("db/rehearsal/"))
) {
  console.log(`migration-rehearsal: no new migrations or rehearsal changes since ${change.ref}`);
  process.exit(0);
}

const run = (cmd: string, args: string[], input?: string) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
};
const psql = (db: string, args: string[], input?: string) =>
  run("psql", [urlFor(db), "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], input);
const recreate = (db: string) =>
  psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`, "-c", `CREATE DATABASE ${db}`]);
const drop = (db: string) => psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`]);
const atlasApply = (db: string, dir: string, amount?: number) =>
  run("atlas", [
    "migrate",
    "apply",
    "--url",
    urlFor(db),
    "--dir",
    `file://${dir}`,
    ...(amount ? [String(amount)] : []),
  ]);
const seed = (db: string, sql: string) => psql(db, ["-v", `scale=${SCALE}`, "-f", "-"], sql);

const BASE_DB = "srs_rehearsal";
const HEAD_DB = "srs_rehearsal_head";
const work = mkdtempSync(join(tmpdir(), "srs-rehearsal-"));
let failed = false;
try {
  // 1. The base: its migrations (re-hashed in a scratch dir) and its data generator.
  const baseFiles = git("ls-tree", "--name-only", change.base, "db/migrations/")
    .split("\n")
    .filter((p) => p.endsWith(".sql"));
  for (const p of baseFiles)
    writeFileSync(join(work, p.split("/").pop() ?? p), git("show", `${change.base}:${p}`));
  run("atlas", ["migrate", "hash", "--dir", `file://${work}`]);
  recreate(BASE_DB);
  atlasApply(BASE_DB, work);
  const baseSeed = spawnSync("git", ["show", `${change.base}:db/rehearsal/seed.sql`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const seedSql =
    baseSeed.status === 0 ? baseSeed.stdout : readFileSync("db/rehearsal/seed.sql", "utf8");
  let t = performance.now();
  seed(BASE_DB, seedSql);
  console.log(
    `migration-rehearsal: base ${change.base.slice(0, 8)} (${baseFiles.length} migrations) seeded at scale ${SCALE} in ${((performance.now() - t) / 1000).toFixed(1)} s${baseSeed.status === 0 ? "" : " (head seed.sql: the base has none)"}`,
  );

  // 2. This change's migrations, one at a time, timed.
  for (const m of change.added) {
    t = performance.now();
    try {
      atlasApply(BASE_DB, join(ROOT, "db/migrations"), 1);
    } catch (e) {
      failed = true;
      console.log(
        `  ✗ ${m}: failed on production-shaped data\n${String(e).replace(/^/gm, "    ")}`,
      );
      break;
    }
    const s = (performance.now() - t) / 1000;
    const slow = s > MAX_SECONDS;
    failed ||= slow;
    console.log(
      `  ${slow ? "✗" : "✓"} ${m}: ${s.toFixed(2)} s${slow ? ` (over ${MAX_SECONDS} s: split it, or backfill in batches)` : ""}`,
    );
  }

  // 3. Invariants: each query returns the rows that violate it.
  const dir = "db/rehearsal/invariants";
  if (!failed && existsSync(dir)) {
    for (const f of readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const rows = psql(BASE_DB, ["-t", "-A", "-f", join(dir, f)]).trim();
      if (rows) {
        failed = true;
        const lines = rows.split("\n");
        console.log(
          `  ✗ invariant ${f}: ${lines.length} violating row(s)\n${lines
            .slice(0, 5)
            .map((l) => `    ${l}`)
            .join("\n")}`,
        );
      } else console.log(`  ✓ invariant ${f}`);
    }
  }

  // 4. The head generator must fit the head schema.
  recreate(HEAD_DB);
  atlasApply(HEAD_DB, join(ROOT, "db/migrations"));
  try {
    seed(HEAD_DB, readFileSync("db/rehearsal/seed.sql", "utf8"));
    console.log("  ✓ db/rehearsal/seed.sql applies to the head schema");
  } catch (e) {
    failed = true;
    console.log(
      `  ✗ db/rehearsal/seed.sql no longer fits the head schema: update it in this change\n${String(e).replace(/^/gm, "    ")}`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
  if (!process.env.REHEARSAL_KEEP) {
    drop(BASE_DB);
    drop(HEAD_DB);
  }
}
console.log(failed ? "migration-rehearsal: FAILED" : "migration-rehearsal: ok");
process.exit(failed ? 1 : 0);
