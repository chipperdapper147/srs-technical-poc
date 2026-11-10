/**
 * What a change does to the schema, relative to its base: the merge-base of
 * HEAD with VERIFY_BASE, else origin/main, else main (as `atlas migrate lint
 * --git-base` would see it). Uncommitted work counts.
 */
import { execFileSync, spawnSync } from "node:child_process";

export const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
export const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const exists = (ref: string) =>
  spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: ROOT })
    .status === 0;

export const isMigration = (p: string) => /^db\/migrations\/[^/]+\.sql$/.test(p);

export interface SchemaChange {
  ref: string;
  base: string;
  /** Migration files the change adds, in apply order. */
  added: string[];
  /** Migration files that existed at the base and were modified or deleted. */
  modified: string[];
  /** Every path the change touches. */
  changed: string[];
}

/** null when there is no base to compare against (e.g. a shallow clone). */
export function schemaChange(): SchemaChange | null {
  const ref = [process.env.VERIFY_BASE, "origin/main", "main"].find(
    (r): r is string => !!r && exists(r),
  );
  if (!ref) return null;
  const base = git("merge-base", ref, "HEAD");
  const rows: [string, string][] = [
    ...git("diff", "--name-status", "--no-renames", base)
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t") as [string, string]),
    ...git("ls-files", "--others", "--exclude-standard")
      .split("\n")
      .filter(Boolean)
      .map((p) => ["A", p] as [string, string]),
  ];
  return {
    ref,
    base,
    added: rows
      .filter(([s, p]) => s === "A" && isMigration(p))
      .map(([, p]) => p)
      .sort(),
    modified: rows.filter(([s, p]) => s !== "A" && isMigration(p)).map(([, p]) => p),
    changed: rows.map(([, p]) => p),
  };
}
