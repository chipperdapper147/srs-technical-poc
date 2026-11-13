import assert from "node:assert/strict";
import { test } from "node:test";
import { excluded, lockedPackages, parseFloor, tooYoung } from "./release-age.ts";

const lockfile = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      '@biomejs/biome':
        specifier: 2.6.6
        version: 2.6.6

packages:

  '@biomejs/biome@2.6.6':
    resolution: {integrity: sha512-x}
    hasBin: true

  next@16.0.0:
    resolution: {integrity: sha512-y}

snapshots:

  next@16.0.0(react@19.2.0):
    dependencies:
      react: 19.2.0
`;

test("reads only the packages section's keys", () => {
  assert.deepEqual(lockedPackages(lockfile), [
    { name: "@biomejs/biome", version: "2.6.6" },
    { name: "next", version: "16.0.0" },
  ]);
});

test("reads the floor and its excludes", () => {
  const ws = `packages:
  - apps/*
minimumReleaseAge: 10080
minimumReleaseAgeExclude:
  - '@scope/*' # reason
  - left-pad@1.3.1
`;
  assert.deepEqual(parseFloor(ws), { minutes: 10080, exclude: ["@scope/*", "left-pad@1.3.1"] });
  assert.deepEqual(parseFloor("packages: []\n"), { minutes: 0, exclude: [] });
});

test("matches excludes by name glob or exact version", () => {
  assert.ok(excluded({ name: "@scope/a", version: "1.0.0" }, ["@scope/*"]));
  assert.ok(excluded({ name: "left-pad", version: "1.3.1" }, ["left-pad@1.3.1"]));
  assert.ok(!excluded({ name: "left-pad", version: "1.3.2" }, ["left-pad@1.3.1"]));
  assert.ok(!excluded({ name: "left-pad-x", version: "1.0.0" }, ["left-pad"]));
});

test("flags packages younger than the floor, soonest to mature first", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const published: Record<string, string> = {
    "old@1.0.0": "2026-11-01T00:00:00Z",
    "edge@1.0.0": "2026-11-06T12:00:00Z", // exactly 7 days: passes
    "young@1.0.0": "2026-11-10T00:00:00Z",
    "younger@1.0.0": "2026-11-12T00:00:00Z",
    "skipped@1.0.0": "2026-11-12T00:00:00Z",
  };
  const locked = Object.keys(published).map((k) => ({
    name: k.split("@")[0] ?? k,
    version: "1.0.0",
  }));
  const young = tooYoung(
    locked,
    (p) => new Date(published[`${p.name}@${p.version}`] ?? 0),
    { minutes: 10080, exclude: ["skipped"] },
    now,
  );
  assert.deepEqual(
    young.map((y) => [y.name, y.matures.toISOString()]),
    [
      ["young", "2026-11-17T00:00:00.000Z"],
      ["younger", "2026-11-19T00:00:00.000Z"],
    ],
  );
});
