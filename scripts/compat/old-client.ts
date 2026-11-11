/**
 * Check `compat-old-client`: the web app as it is at the base (the stand-in
 * for the client already loaded in users' browsers, ADR 0003) still works
 * against the API and schema this change ships. The web and the API deploy
 * separately, so for a while every new API serves old clients.
 *
 * The base commit's web app is built and started (on its own ports), the
 * head API runs on a scratch database with the head migrations and seed,
 * and the base commit's e2e specs drive the old app through it.
 *
 * Runs when the change touches the API, the shared contracts or the schema
 * (otherwise the old client meets the old API, which the base's CI tested),
 * or the compatibility tooling itself.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { ROOT, schemaChange } from "../schema/change.ts";
import { dropDb, loadLocalEnv, recreateDb, run, urlFor, withBaseWorktree } from "./worktree.ts";

const API_PORT = 4100;
const WEB_PORT = 3100;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DB = "srs_compat_client";
const TRIGGERS = ["apps/api/", "packages/shared/", "db/", "scripts/compat/"];

const change = schemaChange();
if (!change) {
  console.log("compat-old-client: no base ref (shallow clone?); nothing to compare");
  process.exit(0);
}
const touched = change.changed.filter((p) => TRIGGERS.some((t) => p.startsWith(t)));
if (touched.length === 0) {
  console.log(`compat-old-client: no API, contract or schema change since ${change.ref}`);
  process.exit(0);
}
loadLocalEnv();
const base = change.base.slice(0, 8);
console.log(
  `compat-old-client: the web app and e2e specs at ${base} (${change.ref}) against the head API (${touched.length} changed file(s) under ${TRIGGERS.join(", ")})`,
);

const servers: ChildProcess[] = [];
const start = (name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => {
  const child = spawn(cmd, args, { cwd, env, stdio: "inherit", detached: true });
  child.on("exit", (code) => code && console.log(`compat-old-client: ${name} exited with ${code}`));
  servers.push(child);
};
const stopAll = () => {
  for (const s of servers) {
    try {
      if (s.pid) process.kill(-s.pid, "SIGTERM"); // the whole process group
    } catch {}
  }
};
async function waitFor(url: string, seconds = 120) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up within ${seconds} s`);
}

const dbUrl = urlFor(DB);
const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  LOG_LEVEL: "warn",
  NEXT_TELEMETRY_DISABLED: "1",
};
let status = 1;
try {
  // The head side: schema, seed and API.
  recreateDb(DB);
  if (run("atlas", ["migrate", "apply", "--url", dbUrl, "--dir", "file://db/migrations"]) !== 0)
    throw new Error("head migrations failed");
  if (run("pnpm", ["db:seed"], { env }) !== 0) throw new Error("head seed failed");
  start("head API", "node", ["src/server.ts"], `${ROOT}/apps/api`, {
    ...env,
    API_PORT: String(API_PORT),
    WEB_ORIGIN: WEB_URL,
  });
  await waitFor(`${API_URL}/health`);

  status = await withBaseWorktree(change, async (dir) => {
    // The base side: its web app, built for the head API, and its specs.
    const webEnv = { ...env, NEXT_PUBLIC_API_URL: API_URL };
    if (run("pnpm", ["--filter", "@app/web", "build"], { cwd: dir, env: webEnv }) !== 0)
      throw new Error(`the web app at ${base} did not build`);
    start(
      "base web",
      "node_modules/.bin/next",
      ["start", "--port", String(WEB_PORT)],
      `${dir}/apps/web`,
      webEnv,
    );
    await waitFor(WEB_URL);
    // The base's Playwright may differ from ours: give it its browser (CI),
    // unless a preinstalled Chromium is configured (cloud sessions).
    if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
      run("pnpm", ["--filter", "@app/e2e", "exec", "playwright", "install", "chromium"], {
        cwd: dir,
      });
    }
    // CI unset: the base config then reuses the servers started here.
    return run(
      "pnpm",
      [
        "--filter",
        "@app/e2e",
        "exec",
        "playwright",
        "test",
        "--trace",
        "off",
        "--retries",
        "1",
        "--project",
        "chromium",
      ],
      { cwd: dir, env: { ...webEnv, CI: "", E2E_WEB_URL: WEB_URL } },
    );
  });
} finally {
  stopAll();
  dropDb(DB);
}
if (status !== 0) {
  console.log(
    `compat-old-client: FAILED. The web app at ${base} breaks against this API, so users with the deployed client would hit it after the API deploys. Keep the API change additive (see "API changes" in docs/verification.md).`,
  );
}
process.exit(status);
