import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// apps/api/tsconfig.json can't extend tsconfig.base.json: Vercel builds the
// API from apps/api and would typecheck without strict (decisions log).
test("apps/api/tsconfig.json keeps every option of tsconfig.base.json", () => {
  const base = read("tsconfig.base.json").compilerOptions;
  const api = read("apps/api/tsconfig.json");
  assert.equal(api.extends, undefined);
  for (const [option, value] of Object.entries(base)) {
    assert.deepEqual(api.compilerOptions[option], value, option);
  }
});

// Vercel compiles the API's .ts files to .js; without this the output still
// imports ./x.ts and every request fails with ERR_MODULE_NOT_FOUND.
test("apps/api/tsconfig.json rewrites .ts imports when compiled", () => {
  assert.equal(
    read("apps/api/tsconfig.json").compilerOptions.rewriteRelativeImportExtensions,
    true,
  );
});
