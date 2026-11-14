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
