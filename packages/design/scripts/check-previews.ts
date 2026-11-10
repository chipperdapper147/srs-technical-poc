/// <reference lib="dom" />
/**
 * Render every preview in .system/project (run `pnpm design:system` first) the
 * way the design-system page does: tokens.css, bundle.css, React 18 UMD, the
 * bundle, then the preview, once per theme. Fails on any console error,
 * uncaught exception, or a preview whose root stays empty.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const OUT = at("../.system/project/");
if (!existsSync(OUT)) throw new Error("no .system/project: run `pnpm design:system` first");
const require = createRequire(import.meta.url);
const read = (file: string) => readFileSync(file, "utf8");
// The UMD builds the page loads (React 19 has none), pinned as aliased packages.
const umd = (pkg: string, file: string) =>
  `${dirname(require.resolve(`${pkg}/package.json`))}/umd/${file}`;
const libs = [
  umd("react-18", "react.production.min.js"),
  umd("react-dom-18", "react-dom.production.min.js"),
].map(read);

const tokens = JSON.parse(read(`${OUT}tokens.json`)) as { color: { themes: { id: string }[] } };
const themes = tokens.color.themes.map((t) => t.id);
// The Google Fonts import can't load offline; it isn't what this checks.
const css = `${read(`${OUT}tokens.css`)}\n${read(`${OUT}components/bundle.css`).replace(/^@import url\([^)]*\);\n/, "")}`;
const head = `<style>${css}</style>${[...libs, read(`${OUT}components/bundle.js`)].map((js) => `<script>${js}</script>`).join("")}`;

const components = readdirSync(`${OUT}components`).filter((d) =>
  existsSync(`${OUT}components/${d}/preview.html`),
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const failures: string[] = [];
for (const theme of themes) {
  for (const name of components) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    const body = read(`${OUT}components/${name}/preview.html`);
    if (!body.startsWith("<!-- @dsCard")) errors.push("line 1 is not the @dsCard marker");
    await page.setContent(
      `<!doctype html><html data-theme="${theme}"><head>${head}</head><body>${body}</body></html>`,
    );
    const empty = await page.evaluate(() => {
      const root = document.getElementById("root");
      return root !== null && root.childElementCount === 0;
    });
    if (empty) errors.push("#root rendered nothing");
    if (errors.length > 0) failures.push(`${name} (${theme}): ${errors.join("; ")}`);
    await page.close();
  }
}
await browser.close();
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `design: ${components.length} previews × ${themes.length} themes rendered without errors`,
);
