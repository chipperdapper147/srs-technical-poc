/**
 * `pnpm design:system`: assemble the design-system artifact's files in
 * packages/design/.system/project/ (git-ignored), ready to publish.
 *
 *   tokens.json, tokens.css        from ../tokens.json (+ provenance)
 *   README.md, components/**       copied from ../system/
 *   components/bundle.js           apps/web/src/components as ONE classic script (window.SRS)
 *   components/bundle.css          Tailwind compiled over those components, without token values
 *
 * The bundle is built from ESM only. The preview frame provides React 18 as
 * globals (window.React, window.ReactDOM; React 19 ships no UMD build), so
 * `react`, `react-dom` and the JSX runtime resolve to small generated ESM
 * modules that re-export those globals. Their export lists come from
 * Object.keys of the installed packages, so no API is missed.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { build } from "rolldown";
import { type Tokens, toSystemCss } from "../src/generate.ts";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const ROOT = at("../../../");
const WEB = `${ROOT}apps/web`;
const OUT = at("../.system/project/");
const WORK = at("../.system/build/");
const NAMESPACE = "SRS";
const COMPONENTS: { name: string; file: string; exports: string[] }[] = [
  { name: "Button", file: "ui/button", exports: ["Button"] },
  { name: "Badge", file: "ui/badge", exports: ["Badge"] },
  {
    name: "Card",
    file: "ui/card",
    exports: [
      "Card",
      "CardAction",
      "CardContent",
      "CardDescription",
      "CardFooter",
      "CardHeader",
      "CardTitle",
    ],
  },
  {
    name: "Alert",
    file: "ui/alert",
    exports: ["Alert", "AlertAction", "AlertDescription", "AlertTitle"],
  },
  {
    name: "Progress",
    file: "ui/progress",
    exports: ["Progress", "ProgressLabel", "ProgressValue"],
  },
  { name: "Input", file: "ui/input", exports: ["Input"] },
  { name: "Textarea", file: "ui/textarea", exports: ["Textarea"] },
  { name: "Label", file: "ui/label", exports: ["Label"] },
  { name: "NativeSelect", file: "native-select", exports: ["NativeSelect"] },
  { name: "Switch", file: "ui/switch", exports: ["Switch"] },
];

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

rmSync(at("../.system/"), { recursive: true, force: true });
mkdirSync(`${OUT}components`, { recursive: true });
mkdirSync(WORK, { recursive: true });

// ---------------------------------------------------------------- tokens and docs

const tokens = JSON.parse(readFileSync(at("../tokens.json"), "utf8")) as Tokens;
const ref = `${git("rev-parse", "--abbrev-ref", "HEAD")}@${git("rev-parse", "--short", "HEAD")}`;
const withMeta = {
  ...tokens,
  meta: {
    source: "github",
    repo: "chipperdapper147/srs-technical-poc",
    ref,
    package: "packages/design",
    paths: { tokens: ["packages/design/tokens.json"], docs: ["packages/design/system"] },
    components: Object.fromEntries(
      COMPONENTS.map((c) => [c.name, `apps/web/src/components/${c.file}.tsx`]),
    ),
    synced: new Date().toISOString().slice(0, 10),
  },
};
writeFileSync(`${OUT}tokens.json`, `${JSON.stringify(withMeta, null, 2)}\n`);
writeFileSync(`${OUT}tokens.css`, toSystemCss(tokens, tokens.name));
cpSync(at("../system/"), OUT, { recursive: true });

// ---------------------------------------------------------------- bundle.js (ESM in, one IIFE out)

const fromWeb = createRequire(`${WEB}/package.json`);
const keysOf = (pkg: string) =>
  Object.keys(fromWeb(pkg) as object).filter(
    (k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== "default",
  );
const globalModule = (global: string, keys: string[]) =>
  `const g = window.${global};\nexport default g;\nexport const { ${keys.join(", ")} } = g;\n`;
const shims = {
  react: `${WORK}react.mjs`,
  "react-dom": `${WORK}react-dom.mjs`,
  "react/jsx-runtime": `${WORK}jsx-runtime.mjs`,
  "react/jsx-dev-runtime": `${WORK}jsx-runtime.mjs`,
};
writeFileSync(shims.react, globalModule("React", keysOf("react")));
writeFileSync(shims["react-dom"], globalModule("ReactDOM", keysOf("react-dom")));
writeFileSync(
  shims["react/jsx-runtime"],
  `import { createElement, Fragment } from "react";
export { Fragment };
// The automatic JSX runtime over createElement (React 18 globals have no jsx-runtime).
export function jsx(type, props, key) {
  return createElement(type, key === undefined ? props : { ...props, key });
}
export { jsx as jsxs, jsx as jsxDEV };
`,
);
writeFileSync(
  `${WORK}entry.ts`,
  COMPONENTS.map(
    (c) => `export { ${c.exports.join(", ")} } from "${WEB}/src/components/${c.file}.tsx";`,
  ).join("\n"),
);

await build({
  input: `${WORK}entry.ts`,
  platform: "browser",
  logLevel: "silent",
  resolve: { alias: { "@": `${WEB}/src` } },
  transform: { jsx: { runtime: "automatic" }, define: { "process.env.NODE_ENV": '"production"' } },
  plugins: [
    {
      name: "react-globals",
      resolveId: (id: string) => shims[id as keyof typeof shims] ?? null,
    },
  ],
  output: { format: "iife", name: NAMESPACE, file: `${WORK}bundle.js`, minify: true },
});
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components: COMPONENTS.map((c) => ({ name: c.name })) })} */`;
const bundle = `${header}\n${readFileSync(`${WORK}bundle.js`, "utf8")}`;
if (/<\/script|<!--/i.test(bundle))
  throw new Error("bundle.js contains </script or <!--, which would break inlining");
writeFileSync(`${OUT}components/bundle.js`, bundle);

// ---------------------------------------------------------------- bundle.css (no token values: those come from tokens.css)

const globals = readFileSync(`${WEB}/src/app/globals.css`, "utf8");
const block = (re: RegExp) => {
  const m = re.exec(globals);
  if (!m) throw new Error(`globals.css: ${re} not found`);
  return m[0];
};
const input = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@source "./components";
/* The app's dark: variant keys off .dark; the design-system page sets data-theme="dark". */
@custom-variant dark (&:is(.dark *, [data-theme="dark"] *));
${block(/@theme inline \{[\s\S]*?\n\}/)}
${block(/@layer base \{[\s\S]*?\n\}/)}
`;
const css = await postcss([tailwind({ optimize: { minify: true } })]).process(input, {
  // Placed in apps/web/src so the imports and @source resolve as they do for the app.
  from: `${WEB}/src/design-system-bundle.css`,
});
if (/<\/style/i.test(css.css)) throw new Error("bundle.css contains </style");
const font =
  '@import url("https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap");';
writeFileSync(`${OUT}components/bundle.css`, `${font}\n${css.css}`);

console.log(`design: system written to ${OUT} (${ref}); bundle.js ${bundle.length} bytes`);
