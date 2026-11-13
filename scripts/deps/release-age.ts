/**
 * Every package in pnpm-lock.yaml must be at least minimumReleaseAge old
 * (pnpm-workspace.yaml), unless minimumReleaseAgeExclude lists it.
 *
 * Why: pnpm re-checks the floor against locked packages whenever it
 * re-resolves, so one too-young entry blocks every later `pnpm add` or
 * upgrade, by anyone, until it ages out. pnpm itself never locks a
 * too-young release, but a lockfile can still get one: a floor overridden
 * on the command line, a hand edit, a bot or pnpm version that ignores the
 * floor, or an exclude removed before its release aged. Releases only get
 * older, so a lockfile that passes when it changes never trips the floor
 * later. So the check runs only when pnpm-lock.yaml or pnpm-workspace.yaml
 * differs from the base (VERIFY_BASE, else origin/main, else main), and
 * always when there is no base.
 *
 *   node scripts/deps/release-age.ts
 */
import { execFile, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

export interface Locked {
  name: string;
  version: string;
}

export interface Floor {
  minutes: number;
  /** pnpm's patterns: a package name (`*` matches any run) or `name@version`. */
  exclude: string[];
}

/** The keys of the lockfile's `packages:` section. */
export function lockedPackages(lockfile: string): Locked[] {
  const out: Locked[] = [];
  let inPackages = false;
  for (const line of lockfile.split("\n")) {
    if (/^\S/.test(line)) inPackages = line === "packages:";
    const m = inPackages && /^ {2}'?([^\s']+)'?:$/.exec(line);
    if (!m) continue;
    const key = m[1] ?? "";
    const at = key.lastIndexOf("@");
    if (at <= 0) continue;
    out.push({ name: key.slice(0, at), version: key.slice(at + 1) });
  }
  return out;
}

/** minimumReleaseAge and minimumReleaseAgeExclude from pnpm-workspace.yaml. */
export function parseFloor(workspace: string): Floor {
  const minutes = Number(/^minimumReleaseAge:\s*(\d+)/m.exec(workspace)?.[1] ?? 0);
  const block = /^minimumReleaseAgeExclude:\s*\n((?:\s+-.*\n?)*)/m.exec(workspace)?.[1] ?? "";
  const exclude = [...block.matchAll(/^\s+-\s*['"]?([^'"\s#]+)/gm)].map((m) => m[1] ?? "");
  return { minutes, exclude };
}

export function excluded(pkg: Locked, patterns: string[]): boolean {
  return patterns.some((p) => {
    const at = p.lastIndexOf("@");
    if (at > 0) return p === `${pkg.name}@${pkg.version}`;
    const re = new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return re.test(pkg.name);
  });
}

export interface Young extends Locked {
  published: Date;
  /** When it passes the floor. */
  matures: Date;
}

/** Locked packages younger than the floor at `now`, oldest-maturing first. */
export function tooYoung(
  locked: Locked[],
  published: (pkg: Locked) => Date | undefined,
  floor: Floor,
  now: Date,
): Young[] {
  const ms = floor.minutes * 60_000;
  return locked
    .filter((pkg) => !excluded(pkg, floor.exclude))
    .flatMap((pkg) => {
      const at = published(pkg);
      if (!at || now.getTime() - at.getTime() >= ms) return [];
      return [{ ...pkg, published: at, matures: new Date(at.getTime() + ms) }];
    })
    .sort((a, b) => a.matures.getTime() - b.matures.getTime());
}

const run = promisify(execFile);

async function publishTimes(names: string[]): Promise<Map<string, Record<string, string>>> {
  const times = new Map<string, Record<string, string>>();
  const queue = [...names];
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        // npm, not fetch: it follows the registry and proxy configuration.
        const { stdout } = await run("npm", ["view", name, "time", "--json"]);
        times.set(name, JSON.parse(stdout));
      }
    }),
  );
  return times;
}

/** true when the lockfile and floor match the base; false when changed or no base. */
function unchangedFromBase(): boolean {
  const git = (...args: string[]) => spawnSync("git", args, { encoding: "utf8" });
  const ref = [process.env.VERIFY_BASE, "origin/main", "main"].find(
    (r) => r && git("rev-parse", "--verify", "--quiet", `${r}^{commit}`).status === 0,
  );
  if (!ref) return false;
  const base = git("merge-base", ref, "HEAD").stdout.trim();
  return (
    !!base &&
    git("diff", "--quiet", base, "--", "pnpm-lock.yaml", "pnpm-workspace.yaml").status === 0
  );
}

async function main(): Promise<void> {
  if (unchangedFromBase()) {
    console.log(
      "release-age: pnpm-lock.yaml and pnpm-workspace.yaml match the base; nothing to check.",
    );
    return;
  }
  const floor = parseFloor(readFileSync("pnpm-workspace.yaml", "utf8"));
  if (floor.minutes === 0) {
    console.log("release-age: no minimumReleaseAge set; nothing to check.");
    return;
  }
  const locked = lockedPackages(readFileSync("pnpm-lock.yaml", "utf8"));
  const times = await publishTimes([...new Set(locked.map((p) => p.name))]);
  const missing: string[] = [];
  const young = tooYoung(
    locked,
    (pkg) => {
      const t = times.get(pkg.name)?.[pkg.version];
      if (!t) missing.push(`${pkg.name}@${pkg.version}`);
      return t ? new Date(t) : undefined;
    },
    floor,
    new Date(),
  );
  for (const m of missing) console.error(`release-age: no publish time for ${m}`);
  if (young.length === 0 && missing.length === 0) {
    console.log(
      `release-age: all ${locked.length} locked packages pass the ${floor.minutes / 1440}-day floor.`,
    );
    return;
  }
  for (const y of young)
    console.error(
      `release-age: ${y.name}@${y.version} published ${y.published.toISOString()}, too young until ${y.matures.toISOString()}`,
    );
  console.error(
    "release-age: these would block every later dependency change. Pin an older release; or, for an urgent security fix only, add it to minimumReleaseAgeExclude with the reason.",
  );
  process.exitCode = 1;
}

if (import.meta.main) await main();
