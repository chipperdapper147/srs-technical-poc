/**
 * The nightly canary's upgrade: set every exact dependency in the workspace's
 * package.json files to its newest stable release published at least
 * `--min-age-days` ago (default 14). That can be older than the current pin,
 * when the pin itself is younger than the floor. Then `pnpm install` with the
 * same minimumReleaseAge resolves the rest: a mature release only pins
 * dependencies at least as old, so the floor holds all the way down.
 *
 * Why not `pnpm up --latest` with minimumReleaseAge: it aims at each
 * package's `latest` tag and fails (ERR_PNPM_NO_MATURE_MATCHING_VERSION)
 * when that release is too young, instead of falling back to an older one.
 *
 *   node scripts/canary/upgrade.ts [--min-age-days 14]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;

function compare(a: string, b: string): number {
  const x = STABLE.exec(a)?.slice(1).map(Number) ?? [];
  const y = STABLE.exec(b)?.slice(1).map(Number) ?? [];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** The newest stable version published at or before `cutoff`, or null. */
export function newestMature(time: Record<string, string>, cutoff: Date): string | null {
  const mature = Object.entries(time)
    .filter(([v, t]) => STABLE.test(v) && new Date(t) <= cutoff)
    .map(([v]) => v)
    .sort(compare);
  return mature.at(-1) ?? null;
}

function manifests(root: string): string[] {
  const dirs = ["apps", "packages"].flatMap((d) =>
    readdirSync(join(root, d), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(root, d, e.name)),
  );
  return [root, ...dirs].map((d) => join(d, "package.json"));
}

async function main() {
  const { values } = parseArgs({ options: { "min-age-days": { type: "string", default: "14" } } });
  const days = Number(values["min-age-days"]);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const files = manifests(process.cwd()).filter((f) => {
    try {
      readFileSync(f);
      return true;
    } catch {
      return false;
    }
  });
  const names = new Set<string>();
  const pkgs = files.map((f) => ({ f, json: JSON.parse(readFileSync(f, "utf8")) }));
  for (const { json } of pkgs)
    for (const field of ["dependencies", "devDependencies"])
      for (const [name, spec] of Object.entries<string>(json[field] ?? {}))
        if (STABLE.test(spec)) names.add(name);

  const targets = new Map<string, string>();
  await Promise.all(
    [...names].map(async (name) => {
      const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
      if (!res.ok) throw new Error(`${name}: registry answered ${res.status}`);
      const { time } = (await res.json()) as { time: Record<string, string> };
      const v = newestMature(time, cutoff);
      if (v) targets.set(name, v);
    }),
  );
  let changed = 0;
  for (const { f, json } of pkgs) {
    for (const field of ["dependencies", "devDependencies"]) {
      for (const [name, spec] of Object.entries<string>(json[field] ?? {})) {
        const to = targets.get(name);
        if (to && STABLE.test(spec) && to !== spec) {
          console.log(
            `${name}: ${spec} → ${to}${compare(to, spec) < 0 ? " (current pin is younger than the floor)" : ""}`,
          );
          json[field][name] = to;
          changed++;
        }
      }
    }
    writeFileSync(f, `${JSON.stringify(json, null, 2)}\n`);
  }
  console.log(
    `canary: ${changed} change(s): every exact dependency at its newest release at least ${days} days old`,
  );
}

if (import.meta.main) await main();
