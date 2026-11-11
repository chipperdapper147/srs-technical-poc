import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local runs read the repo-root .env; CI sets the variables directly.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const CI = !!process.env.CI;
// Lets a machine with a preinstalled Chromium skip `playwright install`.
const chromium = {
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
};
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
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...chromium } },
    // The rest of the browser matrix runs nightly (.github/workflows/nightly.yml)
    // until it is stable enough for the merge gate.
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "mobile-chrome", use: { ...devices["Pixel 7"], ...chromium } },
          { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
        ]
      : []),
  ],
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
