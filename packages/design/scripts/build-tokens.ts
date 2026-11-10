/**
 * `pnpm design:build`: tokens.json → the generated token files.
 *   packages/design/src/tokens.ts   React Native / Expo (hex, dp)
 *   apps/web/src/app/tokens.css     web CSS variables (imported by globals.css)
 * Both are committed; the `design-drift` check regenerates them and fails on a diff.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Tokens, toNativeTs, toWebCss } from "../src/generate.ts";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const tokens = JSON.parse(readFileSync(at("../tokens.json"), "utf8")) as Tokens;
const outputs = {
  [at("../src/tokens.ts")]: toNativeTs(tokens),
  [at("../../../apps/web/src/app/tokens.css")]: toWebCss(tokens),
};
for (const [file, text] of Object.entries(outputs)) writeFileSync(file, text);
// Format like the rest of the repo, so lint and the drift check agree on one copy.
execFileSync("pnpm", ["exec", "biome", "format", "--write", ...Object.keys(outputs)], {
  cwd: at("../../.."),
  stdio: "ignore",
});
console.log(`design: wrote ${Object.keys(outputs).length} token files`);
