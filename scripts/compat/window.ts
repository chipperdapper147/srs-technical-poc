/**
 * The compatibility window (ADR 0003): the versions a change must not break.
 *
 *   deployment candidate   this change (HEAD and the working tree)
 *   production             the newest `release/*` tag
 *   rollback target        the release before it
 *
 * Release tags are written by .github/workflows/release-tag.yml for every
 * commit on main whose CI passed, the stand-in for a deploy until the deploy
 * pipeline records what it deploys (TODO.md, "Across repositories"). With no
 * tags yet (or in a clone without them), the window falls back to the
 * merge-base with VERIFY_BASE / origin/main / main.
 */
import { spawnSync } from "node:child_process";
import { git, ROOT } from "../schema/change.ts";

export interface Version {
  /** What this version is in the window. */
  role: "production" | "rollback target" | "base";
  /** The commit. */
  sha: string;
  /** How to name it in messages: the tag, or the base ref. */
  name: string;
}

export const RELEASE_TAGS = "release/*";

const exists = (ref: string) =>
  spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: ROOT })
    .status === 0;

/**
 * Pure: production is the newest tag, the rollback target the one before it
 * (tags sort by name: release/YYYYMMDD-HHMMSS-<sha>), skipping repeats of
 * the same commit.
 */
export function windowFromTags(tags: { name: string; sha: string }[]): Version[] {
  const sorted = [...tags].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  const versions: Version[] = [];
  for (const tag of sorted) {
    if (versions.some((v) => v.sha === tag.sha)) continue;
    versions.push({
      role: versions.length === 0 ? "production" : "rollback target",
      sha: tag.sha,
      name: tag.name,
    });
    if (versions.length === 2) break;
  }
  return versions;
}

/** The deployed versions this change is checked against, newest first, distinct commits. */
export function compatibilityWindow(): Version[] {
  const tags = git("tag", "--list", RELEASE_TAGS)
    .split("\n")
    .filter(Boolean)
    .map((name) => ({ name, sha: git("rev-list", "-n", "1", name) }));
  const versions = windowFromTags(tags);
  if (versions.length > 0) return versions;
  const ref = [process.env.VERIFY_BASE, "origin/main", "main"].find(
    (r): r is string => !!r && exists(r),
  );
  if (!ref) return [];
  return [
    { role: "base", sha: git("merge-base", ref, "HEAD"), name: `${ref} (no release tags yet)` },
  ];
}

export const describe = (v: Version) => `${v.role} ${v.name} (${v.sha.slice(0, 8)})`;

/** Paths that differ between `sha` and the working tree, including untracked files. */
export function changedSince(sha: string): string[] {
  const tracked = git("diff", "--name-only", "--no-renames", sha).split("\n");
  const untracked = git("ls-files", "--others", "--exclude-standard").split("\n");
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

/** Migration files in the working tree that `sha` does not have. */
export function migrationsSince(sha: string): string[] {
  const at = new Set(git("ls-tree", "--name-only", sha, "db/migrations/").split("\n"));
  return git("ls-files", "--cached", "--others", "--exclude-standard", "db/migrations/")
    .split("\n")
    .filter((p) => /^db\/migrations\/[^/]+\.sql$/.test(p) && !at.has(p))
    .sort();
}
