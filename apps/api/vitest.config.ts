import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Local runs read the repo-root .env; CI sets the variables directly.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  test: {
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
});
