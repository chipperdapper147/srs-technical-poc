import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  lineHeightPx,
  oklchToHex,
  primaryFamily,
  resolveColor,
  type Tokens,
  toNativeTs,
  toPx,
  toWebCss,
} from "./generate.ts";

const tokens = JSON.parse(
  readFileSync(new URL("../tokens.json", import.meta.url), "utf8"),
) as Tokens;

describe("oklchToHex", () => {
  // Reference hex values: Tailwind 4's palette, defined in the same oklch values.
  it.each([
    ["oklch(1 0 0)", "#ffffff"],
    ["oklch(0 0 0)", "#000000"],
    ["oklch(0.145 0 0)", "#0a0a0a"], // neutral-950
    ["oklch(0.205 0 0)", "#171717"], // neutral-900
    ["oklch(0.556 0 0)", "#737373"], // neutral-500
    ["oklch(0.922 0 0)", "#e5e5e5"], // neutral-200
    ["oklch(57.7% 0.245 27.325)", "#e7000b"], // red-600
    ["oklch(62.7% 0.194 149.214)", "#00a63e"], // green-600
  ])("%s → %s", (input, hex) => {
    expect(oklchToHex(input)).toBe(hex);
  });

  it("keeps alpha as a fourth byte", () => {
    expect(oklchToHex("oklch(1 0 0 / 10%)")).toBe("#ffffff1a");
    expect(oklchToHex("oklch(1 0 0 / 0.15)")).toBe("#ffffff26");
  });

  it("rejects what it can't parse", () => {
    expect(() => oklchToHex("red")).toThrow(/not an oklch/);
  });
});

describe("lengths", () => {
  it("converts rem and px, and unitless line heights", () => {
    expect(toPx("0.625rem")).toBe(10);
    expect(toPx("16px")).toBe(16);
    expect(
      lineHeightPx({ name: "x", fontSize: "16px", lineHeight: "1.375", fontWeight: 500 }),
    ).toBe(22);
    expect(lineHeightPx({ name: "x", fontSize: "14px", lineHeight: "20px", fontWeight: 400 })).toBe(
      20,
    );
  });

  it("takes the first family of a stack for native", () => {
    expect(primaryFamily('"Geist", ui-sans-serif, system-ui')).toBe("Geist");
  });
});

describe("tokens.json", () => {
  it("resolves aliases per theme", () => {
    expect(resolveColor(tokens, "verdict-wrong", "light")).toBe(
      resolveColor(tokens, "destructive", "light"),
    );
    expect(resolveColor(tokens, "verdict-wrong", "dark")).toBe(
      resolveColor(tokens, "destructive", "dark"),
    );
  });

  it("has unique names across colour, spacing and radius", () => {
    const names = [...tokens.color.tokens, ...tokens.spacing.tokens, ...tokens.radius.tokens].map(
      (t) => t.name,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("converts every colour for native, in every theme", () => {
    const native = toNativeTs(tokens);
    expect(native).toContain('"background": "#ffffff"');
    expect(native).not.toMatch(/oklch\([\d.]/);
  });

  it("writes light on :root, only changed dark values on .dark, aliases as var()", () => {
    const css = toWebCss(tokens);
    expect(css).toMatch(/:root \{[^}]*--background: oklch\(1 0 0\);/);
    expect(css).toMatch(/\.dark \{[^}]*--background: oklch\(0\.145 0 0\);/);
    expect(css).toContain("--verdict-wrong: var(--destructive);");
    expect(css).toContain("--radius: 0.625rem;");
    // chart-1 is the same in both themes, so .dark doesn't repeat it.
    expect(css.split(".dark")[1]).not.toContain("--chart-1:");
  });
});
