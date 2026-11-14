import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// Vercel's Fastify support takes the first of these it finds in the
// project root (apps/api) or its src/, with app.* before server.*. Only
// src/server.ts starts the server; any other match would be loaded as the
// entry point instead (an app.ts without a default export crashed every
// request in production).
const names = ["app", "index", "server"];
const extensions = ["js", "mjs", "cjs", "ts", "cts", "mts"];

test("apps/api has exactly one Vercel entry point: src/server.ts", () => {
  const found = ["apps/api", "apps/api/src"].flatMap((dir) =>
    names.flatMap((n) => extensions.map((e) => `${dir}/${n}.${e}`)).filter((p) => existsSync(p)),
  );
  assert.deepEqual(found, ["apps/api/src/server.ts"]);
});

// Vercel only accepts an entry point whose source matches this (its own
// regex): "No entrypoint found which imports fastify" otherwise.
test("src/server.ts imports fastify, as Vercel requires of the entry point", () => {
  const source = readFileSync("apps/api/src/server.ts", "utf8");
  assert.match(source, /(?:from|require|import)\s*(?:\(\s*)?["']fastify["']\s*(?:\))?/);
});
