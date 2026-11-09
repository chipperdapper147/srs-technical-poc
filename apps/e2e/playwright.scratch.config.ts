/**
 * Config for throwaway specs in ./scratch (git-ignored). Same servers and
 * fixtures as the real suite, but separate from it: `pnpm e2e` never runs
 * scratch specs, and CI never sees them.
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

export default defineConfig({
  ...base,
  testDir: "./scratch",
  outputDir: "./scratch/test-results",
  retries: 0,
  reporter: "list",
  use: {
    ...base.use,
    // Keep everything: the point of a scratch run is to look at the result.
    trace: "on",
    screenshot: "on",
  },
});
