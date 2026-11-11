/**
 * A deployed version as a runnable checkout: a detached git worktree with its
 * own dependencies, for the compatibility checks (ADR 0003). Which versions:
 * window.ts.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, ROOT } from "../schema/change.ts";
import { remoteDatabases } from "../verify/plan.ts";

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

/** Variables from the repo .env without overriding what is set (as scripts/with-env.sh), local databases only. */
export function loadLocalEnv() {
  const r = spawnSync("bash", ["-c", "set -a; [ -f .env ] && . ./.env; env -0"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  for (const entry of r.stdout.split("\0")) {
    const i = entry.indexOf("=");
    if (i > 0 && process.env[entry.slice(0, i)] === undefined)
      process.env[entry.slice(0, i)] = entry.slice(i + 1);
  }
  const remote = remoteDatabases(process.env);
  if (remote.length > 0) throw new Error(`refusing a non-local database: ${remote.join(", ")}`);
}

/** A database URL like DATABASE_URL's, for another database name. */
export function urlFor(db: string) {
  const admin = process.env.DATABASE_URL;
  if (!admin) throw new Error("DATABASE_URL is not set");
  const u = new URL(admin);
  u.pathname = `/${db}`;
  return u.toString();
}

export function recreateDb(db: string) {
  const status = run("psql", [
    urlFor("postgres"),
    "-X",
    "-q",
    "-c",
    `DROP DATABASE IF EXISTS ${db}`,
    "-c",
    `CREATE DATABASE ${db}`,
  ]);
  if (status !== 0) throw new Error(`could not create database ${db}`);
}

export function dropDb(db: string) {
  run("psql", [urlFor("postgres"), "-X", "-q", "-c", `DROP DATABASE IF EXISTS ${db}`]);
}

/** Check out `sha` with its dependencies installed; `use` runs in it; always cleaned up. */
export async function withWorktree<T>(
  sha: string,
  use: (dir: string) => Promise<T> | T,
): Promise<T> {
  const dir = join(mkdtempSync(join(tmpdir(), "srs-compat-")), "version");
  git("worktree", "add", "--detach", dir, sha);
  try {
    // From pnpm's store: fast, and the base's own lockfile decides versions.
    const status = run(
      "pnpm",
      ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
      { cwd: dir },
    );
    if (status !== 0) throw new Error(`pnpm install failed in the worktree of ${sha.slice(0, 8)}`);
    return await use(dir);
  } finally {
    git("worktree", "remove", "--force", dir);
  }
}

/** Replace the worktree's migrations with this change's: old code, new schema. */
export function useHeadMigrations(dir: string) {
  rmSync(join(dir, "db/migrations"), { recursive: true, force: true });
  if (run("cp", ["-r", join(ROOT, "db/migrations"), join(dir, "db/migrations")]) !== 0)
    throw new Error("could not copy the head migrations");
}
