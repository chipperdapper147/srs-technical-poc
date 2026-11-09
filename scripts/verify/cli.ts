/**
 * `pnpm verify`: decide what a change needs (rules.ts), run it, and report
 * with evidence. See docs/verification.md.
 *
 *   pnpm verify                 plan, run the required checks, report
 *   pnpm verify plan            only print what would run and why
 *   pnpm verify obligations     only check test co-change obligations (CI)
 *   pnpm verify docs            regenerate the rule tables in docs/verification.md
 *
 * Options:
 *   --base <ref>          compare against this ref (default: VERIFY_BASE, origin/main, main)
 *   --all                 run every check and the whole e2e suite
 *   --waive <id>=<why>    waive an obligation for uncommitted work
 *   --skip <check>=<why>  skip a check; the report lists it as skipped
 *   --committed           ignore uncommitted changes (pre-push hook, CI)
 *   --only <a,b,...>      run only these checks of the plan (CI splits jobs this way)
 *   --report <file>       also write the report to a file
 *   --json                print the plan as JSON (with `plan`)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { injectRules } from "./docs.ts";
import { type Plan, parseWaivers, plan, remoteDatabases } from "./plan.ts";
import { CHECKS, type Check, type CheckId, type Need } from "./rules.ts";

const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
process.chdir(root);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string" },
    all: { type: "boolean", default: false },
    waive: { type: "string", multiple: true, default: [] },
    skip: { type: "string", multiple: true, default: [] },
    report: { type: "string" },
    json: { type: "boolean", default: false },
    only: { type: "string" },
    committed: { type: "boolean", default: false },
  },
});
const command = positionals[0] ?? "run";

// ---------------------------------------------------------------- git

function git(...args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

function refExists(ref: string) {
  return spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).status === 0;
}

function resolveBase(): { ref: string; sha: string } {
  const candidates = [values.base, process.env.VERIFY_BASE, "origin/main", "main"];
  const ref = candidates.find((r): r is string => !!r && refExists(r));
  // A full run doesn't depend on the diff, so a shallow CI clone is fine.
  if (!ref && values.all) return { ref: "HEAD", sha: git("rev-parse", "HEAD") };
  if (!ref) throw new Error("No base ref found. Pass --base <ref>.");
  return { ref, sha: git("merge-base", ref, "HEAD") };
}

function changedFiles(base: string): string[] {
  if (values.committed) return git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
  const tracked = git("diff", "--name-only", base);
  const untracked = git("ls-files", "--others", "--exclude-standard");
  return [...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean);
}

function commitWaiverLines(base: string): string[] {
  return git("log", "--format=%B", `${base}..HEAD`).split("\n");
}

// ---------------------------------------------------------------- environment

function loadDotEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function tcpOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 1000 });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

const needHints: Record<Need, string> = {
  postgres: "Postgres is not reachable at DATABASE_URL. Run `pnpm db:setup`.",
  atlas: "Atlas is not on the PATH. See README prerequisites.",
  docker: "Docker is not running (Atlas uses it for its dev database).",
};

/** null when the need is met, otherwise why not. */
async function needUnmet(need: Need): Promise<string | null> {
  if (need === "atlas")
    return spawnSync("atlas", ["version"]).status === 0 ? null : needHints.atlas;
  if (need === "docker") {
    return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0
      ? null
      : needHints.docker;
  }
  // Checks migrate, seed and truncate tables: never point them at a real
  // database (e.g. Neon variables pulled into .env by `neon init`).
  const remote = remoteDatabases(process.env);
  if (remote.length > 0) {
    return `refusing a non-local database (${remote.join(", ")}): checks migrate, seed and truncate it. Restore .env from .env.example; Neon variables belong in .env.neon.`;
  }
  const url = process.env.DATABASE_URL;
  if (!url) return needHints.postgres;
  const { hostname, port } = new URL(url);
  return (await tcpOpen(hostname, Number(port || 5432))) ? null : needHints.postgres;
}

// ---------------------------------------------------------------- run

interface Result {
  id: CheckId;
  status: "passed" | "failed" | "skipped" | "blocked";
  seconds: number;
  note: string;
  why: string[];
}

const readOrNull = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : null);

async function runCheck(check: Check, p: Plan, why: string[], skips: Map<string, string>) {
  const skip = skips.get(check.id);
  if (skip !== undefined) return { status: "skipped", seconds: 0, note: skip } as const;
  for (const need of check.needs ?? []) {
    const unmet = await needUnmet(need);
    if (unmet) return { status: "blocked", seconds: 0, note: unmet } as const;
  }
  let cmd = check.command;
  if (check.id === "e2e" && p.e2e && p.e2e.length > 0) {
    cmd += ` ${p.e2e.map((s) => `tests/${s}.spec.ts`).join(" ")}`;
  }
  const before = (check.drift ?? []).map(readOrNull);
  console.log(`\n▶ ${check.id}: ${cmd}   (required by ${why.join(", ")})\n`);
  const started = performance.now();
  const r = spawnSync("bash", ["-c", cmd], { stdio: "inherit", env: process.env });
  const seconds = (performance.now() - started) / 1000;
  if (r.status !== 0) return { status: "failed", seconds, note: `exit code ${r.status}` } as const;
  const drifted = (check.drift ?? []).filter((f, i) => readOrNull(f) !== before[i]);
  if (drifted.length > 0) {
    const note = `regenerated ${drifted.join(", ")} differs from the working tree: review and commit it`;
    return { status: "failed", seconds, note } as const;
  }
  return { status: "passed", seconds, note: cmd } as const;
}

// ---------------------------------------------------------------- report

const icon = {
  passed: "✅",
  failed: "❌",
  skipped: "⏭️",
  blocked: "⛔",
  met: "✅",
  waived: "⚠️",
  missing: "❌",
};

function report(
  p: Plan,
  base: { ref: string; sha: string },
  results: Result[] | null,
  unknownWaivers: string[],
): string {
  const out: string[] = ["## Verification report", ""];
  out.push(`Base \`${base.ref}\` (${base.sha.slice(0, 8)}), ${p.files.length} changed files.`, "");
  out.push("### Change classes", "", "| Class | Files |", "| --- | --- |");
  for (const { cls, files } of p.classes) {
    const shown = files.slice(0, 6).map((f) => `\`${f}\``);
    if (files.length > 6) shown.push(`… ${files.length - 6} more`);
    out.push(`| **${cls.id}** ${cls.title} | ${shown.join("<br>") || "—"} |`);
  }
  out.push("", "### Checks", "");
  if (p.checks.length === 0) out.push("None required.");
  else {
    out.push("| Check | Result | Time | Required by | Detail |", "| --- | --- | --- | --- | --- |");
    for (const c of p.checks) {
      const r = results?.find((x) => x.id === c.id);
      const status = r ? `${icon[r.status]} ${r.status}` : "planned";
      const time = r && r.seconds > 0 ? `${r.seconds.toFixed(1)} s` : "";
      const detail =
        c.id === "e2e" && !r
          ? p.e2e?.length
            ? p.e2e.join(", ")
            : "whole suite"
          : (r?.note ?? "").replaceAll("|", "\\|");
      out.push(`| \`${c.id}\` | ${status} | ${time} | ${c.why.join(", ")} | ${detail} |`);
    }
  }
  out.push("", "### Obligations", "");
  if (p.obligations.length === 0) out.push("None.");
  for (const o of p.obligations) {
    const detail =
      o.status === "missing" ? `required by ${o.requiredBy.join(", ")}` : o.detail.join(", ");
    out.push(`- ${icon[o.status]} \`${o.id}\` ${o.title}: **${o.status}** (${detail})`);
  }
  for (const id of unknownWaivers)
    out.push(`- ❌ unknown obligation in a Verify-Waive trailer: \`${id}\``);
  out.push("", "### Manual evidence still needed", "");
  if (p.evidence.length === 0) out.push("None.");
  for (const { evidence, why } of p.evidence) {
    out.push(`- [ ] \`${evidence.id}\` ${evidence.title} (${why.join(", ")}): ${evidence.how}`);
  }
  return out.join("\n");
}

async function emit(text: string) {
  console.log(`\n${text}`);
  if (values.report) writeFileSync(values.report, `${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

// ---------------------------------------------------------------- main

function pairs(flags: string[], flag: string): Map<string, string> {
  return new Map(
    flags.map((f) => {
      const i = f.indexOf("=");
      if (i < 1) throw new Error(`${flag} expects <id>=<reason>, got "${f}"`);
      return [f.slice(0, i), f.slice(i + 1)];
    }),
  );
}

async function main(): Promise<number> {
  if (command === "docs") {
    const file = "docs/verification.md";
    writeFileSync(file, injectRules(readFileSync(file, "utf8")));
    // Biome formats Markdown too; format here so `pnpm lint` and the drift
    // check agree on one canonical copy.
    return (
      spawnSync("pnpm", ["exec", "biome", "format", "--write", file], { stdio: "ignore" }).status ??
      1
    );
  }

  loadDotEnv();
  const base = resolveBase();
  const files = changedFiles(base.sha);
  const fromCommits = parseWaivers(commitWaiverLines(base.sha));
  const fromFlags = parseWaivers(values.waive.map((w) => `Verify-Waive: ${w}`));
  const waivers = new Map([...fromCommits.waivers, ...fromFlags.waivers]);
  const unknown = [...fromCommits.unknown, ...fromFlags.unknown];
  const full = plan(files, waivers, { all: values.all });
  const only = values.only?.split(",").map((s) => s.trim());
  const unknownOnly = only?.filter((id) => !CHECKS.some((c) => c.id === id)) ?? [];
  if (unknownOnly.length > 0) throw new Error(`--only: unknown checks ${unknownOnly.join(", ")}`);
  const p = only ? { ...full, checks: full.checks.filter((c) => only.includes(c.id)) } : full;
  const obligationsOk = unknown.length === 0 && p.obligations.every((o) => o.status !== "missing");

  if (command === "plan") {
    if (values.json) console.log(JSON.stringify({ base, ...p }, null, 2));
    else await emit(report(p, base, null, unknown));
    return 0;
  }
  if (command === "obligations") {
    await emit(report(p, base, null, unknown));
    return obligationsOk ? 0 : 1;
  }
  if (command !== "run") {
    console.error(`Unknown command "${command}". See scripts/verify/cli.ts.`);
    return 2;
  }

  const skips = pairs(values.skip, "--skip");
  const results: Result[] = [];
  for (const { id, why } of p.checks) {
    const check = CHECKS.find((c) => c.id === id);
    if (!check) continue;
    results.push({ id, why, ...(await runCheck(check, p, why, skips)) });
  }
  await emit(report(p, base, results, unknown));
  const checksOk = results.every((r) => r.status === "passed" || r.status === "skipped");
  return checksOk && obligationsOk ? 0 : 1;
}

process.exitCode = await main();
