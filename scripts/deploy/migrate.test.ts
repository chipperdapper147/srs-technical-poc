import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ATLAS_VERSION, applyArgs, plan, runSteps, sha256, steps } from "./migrate.ts";

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

test("loads the prebuilt courses after the migrations, on the same direct URL", () => {
  const list = steps("postgres://direct", "/tmp/atlas", "/repo");
  assert.deepEqual(
    list.map((s) => s.name),
    ["migrations", "prebuilt courses"],
  );
  const [migrations, prebuilt] = list;
  assert.equal(migrations?.file, "/tmp/atlas");
  assert.deepEqual(migrations?.args, applyArgs("postgres://direct", "/repo/db/migrations"));
  assert.equal(prebuilt?.file, process.execPath);
  assert.deepEqual(prebuilt?.args, ["/repo/apps/api/src/db/prebuilt.ts"]);
  assert.deepEqual(prebuilt?.env, { DATABASE_URL: "postgres://direct" });
});

test("the prebuilt-courses step points at a script that exists", () => {
  for (const step of steps("postgres://x", "/tmp/atlas").slice(1)) {
    for (const arg of step.args) assert.ok(existsSync(arg), `${arg} is missing`);
  }
});

test("runs every step in order", () => {
  const ran: string[] = [];
  runSteps(steps("postgres://x", "/tmp/atlas"), (s) => ran.push(s.name));
  assert.deepEqual(ran, ["migrations", "prebuilt courses"]);
});

test("a failed migration skips the prebuilt courses and fails the build", () => {
  const ran: string[] = [];
  assert.throws(
    () =>
      runSteps(steps("postgres://x", "/tmp/atlas"), (s) => {
        ran.push(s.name);
        if (s.name === "migrations") throw new Error("atlas exited with 1");
      }),
    /atlas exited with 1/,
  );
  assert.deepEqual(ran, ["migrations"]);
});

test("a failed prebuilt-courses step fails the build", () => {
  assert.throws(
    () =>
      runSteps(steps("postgres://x", "/tmp/atlas"), (s) => {
        if (s.name === "prebuilt courses") throw new Error("node exited with 1");
      }),
    /node exited with 1/,
  );
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
