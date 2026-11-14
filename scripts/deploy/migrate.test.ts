import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ATLAS_VERSION, applyArgs, plan, sha256 } from "./migrate.ts";

test("skips outside Vercel", () => {
  assert.deepEqual(plan({ DATABASE_URL_UNPOOLED: "postgres://x" }), {
    run: false,
    why: "not a Vercel build",
  });
});

test("migrates with the direct URL on every Vercel environment", () => {
  for (const VERCEL_ENV of ["production", "preview"]) {
    assert.deepEqual(plan({ VERCEL_ENV, DATABASE_URL_UNPOOLED: "postgres://direct" }), {
      run: true,
      url: "postgres://direct",
    });
  }
});

test("fails the build on Vercel without a direct URL", () => {
  assert.throws(() => plan({ VERCEL_ENV: "production" }), /DATABASE_URL_UNPOOLED is not set/);
});

test("applies the repository's migrations directory", () => {
  assert.deepEqual(applyArgs("postgres://u", "/repo/db/migrations"), [
    "migrate",
    "apply",
    "--url",
    "postgres://u",
    "--dir",
    "file:///repo/db/migrations",
    "--revisions-schema",
    "public",
  ]);
});

test("pins the same Atlas version as the setup script and CI", () => {
  const setup = readFileSync("scripts/setup-agent-env.sh", "utf8");
  const action = readFileSync(".github/actions/setup/action.yml", "utf8");
  assert.match(setup, new RegExp(`ATLAS_VERSION=${ATLAS_VERSION.replaceAll(".", "\\.")}\\b`));
  assert.match(action, new RegExp(`ATLAS_VERSION: v${ATLAS_VERSION.replaceAll(".", "\\.")}\\b`));
});

test("sha256 is hex SHA-256", () => {
  assert.equal(
    sha256(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
