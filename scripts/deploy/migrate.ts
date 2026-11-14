/**
 * Apply pending migrations during the API's Vercel build, before the new
 * version goes live. Production migrates Neon's production branch; each
 * preview its own branch (the Neon integration injects DATABASE_URL_UNPOOLED,
 * the direct URL that migrations need).
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

export function applyArgs(url: string, dir: string): string[] {
  return ["migrate", "apply", "--url", url, "--dir", `file://${dir}`];
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
  // The URL is an argument, never printed; Atlas doesn't echo it.
  execFileSync(atlas, applyArgs(p.url, join(root, "db/migrations")), { stdio: "inherit" });
}

if (import.meta.main) await main();
