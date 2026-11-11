/**
 * Check `compat-old-client`: each deployed web app in the window
 * (production and the rollback target, window.ts), the clients already
 * loaded in users' browsers, still works against the API and schema this
 * change ships (ADR 0003). The web and the API deploy separately, so for a
 * while every new API serves old clients.
 *
 * The head API runs on a scratch database with the head migrations and
 * seed; each version's web app is built and started on its own port in
 * turn, and that version's e2e specs drive it through the head API.
 *
 * For each version it runs when the change touches the API, the shared
 * contracts or the schema since that version (otherwise its client meets its
 * own API, which its CI tested), or the compatibility tooling itself.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { ROOT } from "../schema/change.ts";
import { changedSince, compatibilityWindow, describe } from "./window.ts";
import { dropDb, loadLocalEnv, recreateDb, run, urlFor, withWorktree } from "./worktree.ts";

const API_PORT = 4100;
const WEB_PORT = 3100;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DB = "srs_compat_client";
const TRIGGERS = ["apps/api/", "packages/shared/", "db/", "scripts/compat/"];

const window = compatibilityWindow();
if (window.length === 0) {
  console.log(
    "compat-old-client: no release tags and no base ref (shallow clone?); nothing to compare",
  );
  process.exit(0);
}
const due = window.filter((version) => {
  const touched = changedSince(version.sha).filter((p) => TRIGGERS.some((t) => p.startsWith(t)));
  if (touched.length === 0)
    console.log(`compat-old-client: ${describe(version)}: no API, contract or schema change since`);
  return touched.length > 0;
});
if (due.length === 0) process.exit(0);
loadLocalEnv();

const servers: ChildProcess[] = [];
const start = (name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => {
  const child = spawn(cmd, args, { cwd, env, stdio: "inherit", detached: true });
  // 143: stopped by us (SIGTERM); anything else is worth a line.
  child.on(
    "exit",
    (code) => code && code !== 143 && console.log(`compat-old-client: ${name} exited with ${code}`),
  );
  servers.push(child);
  return child;
};
const stop = (child: ChildProcess) => {
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {}
};
async function waitForPortFree(port: number, seconds = 30) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      await fetch(`http://localhost:${port}`);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
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
let failed = 0;
try {
  // The head side, shared by every version: schema, seed and API.
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

  for (const version of due) {
    console.log(
      `compat-old-client: the web app and e2e specs of ${describe(version)} against the head API`,
    );
    const status = await withWorktree(version.sha, async (dir) => {
      // That version's web app, built for the head API, and its specs.
      const webEnv = { ...env, NEXT_PUBLIC_API_URL: API_URL };
      if (run("pnpm", ["--filter", "@app/web", "build"], { cwd: dir, env: webEnv }) !== 0)
        throw new Error(`the web app of ${describe(version)} did not build`);
      const web = start(
        `web of ${version.name}`,
        "node_modules/.bin/next",
        ["start", "--port", String(WEB_PORT)],
        `${dir}/apps/web`,
        webEnv,
      );
      try {
        await waitFor(WEB_URL);
        // Its Playwright may differ from ours: give it its browser (CI),
        // unless a preinstalled Chromium is configured (cloud sessions).
        if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
          run("pnpm", ["--filter", "@app/e2e", "exec", "playwright", "install", "chromium"], {
            cwd: dir,
          });
        }
        // CI unset: its config then reuses the servers started here.
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
      } finally {
        stop(web);
        await waitForPortFree(WEB_PORT);
      }
    });
    if (status !== 0) {
      failed++;
      console.log(
        `compat-old-client: FAILED for ${describe(version)}. Its web app breaks against this API, so users still running it would hit the failure after the API deploys. Keep the API change additive (see "API changes" in docs/verification.md).`,
      );
    }
  }
} finally {
  stopAll();
  dropDb(DB);
}
process.exit(failed > 0 ? 1 : 0);
