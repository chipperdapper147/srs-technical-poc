/**
 * Prepare the database during the API's Vercel build, before the new
 * version goes live: apply pending migrations, then insert the prebuilt
 * courses this database has never had (apps/api/src/db/prebuilt.ts, which
 * never deletes or overwrites). Production prepares Neon's production branch;
 * each preview its own branch (the Neon integration injects
 * DATABASE_URL_UNPOOLED, the direct URL that migrations need). A step runs
 * only after the one before it succeeded, and a failed step fails the build.
 *
 * Vercel's build has no Docker, so this downloads Atlas's release binary,
 * pinned to the version CI and the setup script use and checked against a
 * pinned SHA-256 before it runs.
 *
 *   node scripts/deploy/migrate.ts          (apps/api's vercel-build runs it)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep in step with scripts/setup-agent-env.sh and .github/actions/setup.
export const ATLAS_VERSION = "1.3.8";
export const ATLAS_SHA256 = "00bbb0a28e41198ae4507f0130b7151ce002404ebe4b6a0c0e27c12ddb95bc86";
const ATLAS_URL = `https://release.ariga.io/atlas/atlas-linux-amd64-v${ATLAS_VERSION}`;

const root = fileURLToPath(new URL("../..", import.meta.url));

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** What to do, from the environment: skip off Vercel, fail without a URL. */
export function plan(
  env: NodeJS.ProcessEnv,
): { run: false; why: string } | { run: true; url: string } {
  if (!env.VERCEL_ENV) return { run: false, why: "not a Vercel build" };
  const url = env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set: connect the Neon integration to this project and environment",
    );
  }
  return { run: true, url };
}

/**
 * `--revisions-schema public`: on Neon, Atlas created its own
 * atlas_schema_revisions schema but put the table in public, then looked
 * for it in the schema and failed. Naming the schema makes creating and
 * reading agree on every server.
 */
export function applyArgs(url: string, dir: string): string[] {
  return [
    "migrate",
    "apply",
    "--url",
    url,
    "--dir",
    `file://${dir}`,
    "--revisions-schema",
    "public",
  ];
}

export interface Step {
  name: string;
  file: string;
  args: string[];
  /** Variables set for this step, on top of the build's own. */
  env?: Record<string, string>;
}

/**
 * The deploy steps, in order. Both use the direct URL: each is one short
 * batch job, and the prebuilt courses need the migrated schema.
 */
export function steps(url: string, atlas: string, repo: string = root): Step[] {
  return [
    { name: "migrations", file: atlas, args: applyArgs(url, join(repo, "db/migrations")) },
    {
      name: "prebuilt courses",
      file: process.execPath,
      args: [join(repo, "apps/api/src/db/prebuilt.ts")],
      env: { DATABASE_URL: url },
    },
  ];
}

/** Run the steps in order. `exec` throws when a step fails, which skips the rest. */
export function runSteps(list: Step[], exec: (step: Step) => void): void {
  for (const step of list) {
    console.log(`deploy: ${step.name}`);
    exec(step);
  }
}

async function atlasBinary(): Promise<string> {
  const path = join(tmpdir(), `atlas-${ATLAS_VERSION}`);
  if (!existsSync(path) || sha256(readFileSync(path)) !== ATLAS_SHA256) {
    const res = await fetch(ATLAS_URL);
    if (!res.ok) throw new Error(`downloading Atlas: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const got = sha256(bytes);
    if (got !== ATLAS_SHA256) throw new Error(`Atlas checksum mismatch: got ${got}`);
    writeFileSync(path, bytes);
  }
  chmodSync(path, 0o755);
  return path;
}

async function main(): Promise<void> {
  const p = plan(process.env);
  if (!p.run) {
    console.log(`migrate: skipped (${p.why})`);
    return;
  }
  const atlas = await atlasBinary();
  console.log(
    `migrate: applying db/migrations with Atlas ${ATLAS_VERSION} (${process.env.VERCEL_ENV})`,
  );
  // The URL is an argument or a variable, never printed; neither step echoes it.
  runSteps(steps(p.url, atlas), (step) =>
    execFileSync(step.file, step.args, { stdio: "inherit", env: { ...process.env, ...step.env } }),
  );
}

if (import.meta.main) await main();
