import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Vercel's function loader can't require() ES modules, which Node 24 can.
// `--no-experimental-require-module` gives local Node the same limit, so a
// dependency that would crash the deployed API fails here instead.
const root = fileURLToPath(new URL("..", import.meta.url));

function buildUnderVercelLimits(vercelEnv: string | undefined): string {
  const script = `
    const { buildApp } = await import("./src/build-app.ts");
    const { createDb } = await import("./src/db/index.ts");
    const app = await buildApp({
      db: createDb("postgres://u:p@127.0.0.1:1/none"),
      env: { WEB_ORIGIN: "http://localhost:3000", AUTH_MODE: "dev", LOG_LEVEL: "silent",
             API_ACCESS_KEY: "${"k".repeat(40)}", VERCEL_ENV: ${JSON.stringify(vercelEnv)} },
    });
    await app.ready();
    console.log("ready");
    await app.close();
  `;
  try {
    return execFileSync(
      process.execPath,
      ["--no-experimental-require-module", "--input-type=module", "-e", script],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
}

describe("Vercel's runtime", () => {
  it("builds the app without require() of ES modules", () => {
    expect(buildUnderVercelLimits("production")).toBe("ready");
  });

  it("would fail with Swagger UI, which is why Vercel builds skip it", () => {
    expect(buildUnderVercelLimits(undefined)).toMatch(/ERR_REQUIRE_ESM/);
  });
});

// Vercel's Node runtime (@vercel/node bundling-handler) imports the entry
// point with http.Server#listen replaced by a stub that never calls back,
// then uses its default export as the (req, res) handler. Reproduce that:
// the import must finish, and the handler must answer.
function serveLikeVercel(): string {
  const script = `
    import http from "node:http";
    const original = http.Server.prototype.listen;
    http.Server.prototype.listen = function () { return this; };
    const timer = setTimeout(() => { console.log("import hung"); process.exit(1); }, 5000);
    const mod = await import("./src/server.ts");
    clearTimeout(timer);
    http.Server.prototype.listen = original;
    if (typeof mod.default !== "function") { console.log("no default handler"); process.exit(1); }
    const server = http.createServer(mod.default);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const me = await fetch(base + "/me");
    const docs = await fetch(base + "/docs/json");
    console.log(me.status + " " + docs.status);
    server.close();
    process.exit(0);
  `;
  try {
    return execFileSync(
      process.execPath,
      ["--no-experimental-require-module", "--input-type=module", "-e", script],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          VERCEL_ENV: "production",
          API_ACCESS_KEY: "k".repeat(40),
          DATABASE_URL: "postgres://u:p@127.0.0.1:1/none",
          LOG_LEVEL: "silent",
        },
      },
    ).trim();
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  }
}

describe("Vercel's handler", () => {
  it("loads without waiting on listen() and answers through the default export", () => {
    expect(serveLikeVercel()).toBe("401 200");
  });
});
