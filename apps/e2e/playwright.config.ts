import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local runs read the repo-root .env; CI sets the variables directly.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const CI = !!process.env.CI;
const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Lets a machine with a preinstalled Chromium skip `playwright install`.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Starts the stack unless it is already running (e.g. `pnpm dev` locally).
  // CI runs the production build of the web app.
  webServer: [
    {
      command: "pnpm --filter @app/api start",
      url: `${API_URL}/health`,
      reuseExistingServer: !CI,
      env: { LOG_LEVEL: "warn" },
    },
    {
      command: CI ? "pnpm --filter @app/web start" : "pnpm --filter @app/web dev",
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
