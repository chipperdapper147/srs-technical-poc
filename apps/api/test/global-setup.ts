import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Bring the test database up to the latest migration before any test runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  execFileSync("atlas", ["migrate", "apply", "--url", url, "--dir", "file://db/migrations"], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
  });
}
