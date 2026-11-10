/**
 * tokens.json → every platform's form of the tokens. Pure: the scripts in
 * ../scripts do the file I/O. tokens.json follows the Design System
 * artifact's format (a list per family, colours per theme, `{alias}` refs).
 */

export interface ColorToken {
  name: string;
  /** Per theme id, or one string for the first theme. */
  value: string | Record<string, string>;
  usage?: string;
}
export interface PlainToken {
  name: string;
  value: string;
  usage?: string;
}
export interface TextStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  family?: string;
  sample?: string;
  usage?: string;
}
export interface Tokens {
  name: string;
  version: number;
  color: { themes: { id: string; name: string }[]; tokens: ColorToken[] };
  type: {
    families: Record<string, string>;
    groups: { name: string; family: string; styles: TextStyle[] }[];
  };
  spacing: { tokens: PlainToken[] };
  radius: { tokens: PlainToken[] };
}

const ALIAS = /^\{([A-Za-z0-9][A-Za-z0-9_.-]*)\}$/;

/** A colour token's value in a theme; a missing theme inherits the first. */
export function themeValue(tokens: Tokens, token: ColorToken, theme: string): string {
  const first = tokens.color.themes[0]?.id ?? "light";
  if (typeof token.value === "string") return token.value;
  const value = token.value[theme] ?? token.value[first];
  if (value === undefined) throw new Error(`color ${token.name} has no value for ${theme}`);
  return value;
}

/** Follow `{alias}` chains to a literal colour. */
export function resolveColor(
  tokens: Tokens,
  name: string,
  theme: string,
  seen: string[] = [],
): string {
  if (seen.includes(name)) throw new Error(`alias cycle: ${[...seen, name].join(" → ")}`);
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`unknown color token: ${name}`);
  const value = themeValue(tokens, token, theme);
  const alias = ALIAS.exec(value);
  return alias?.[1] ? resolveColor(tokens, alias[1], theme, [...seen, name]) : value;
}

// ---------------------------------------------------------------- colour maths

/** `oklch(L C h)` or `oklch(L C h / a)`; L and a as numbers or percentages. */
export function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } {
  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
    value.trim(),
  );
  if (!m?.[1] || !m[2] || !m[3]) throw new Error(`not an oklch() colour: ${value}`);
  const num = (s: string) => (s.endsWith("%") ? Number(s.slice(0, -1)) / 100 : Number(s));
  return { l: num(m[1]), c: Number(m[2]), h: Number(m[3]), alpha: m[4] ? num(m[4]) : 1 };
}

/** OKLCH → sRGB hex (`#rrggbb`, or `#rrggbbaa` with alpha), clipped to the sRGB gamut. */
export function oklchToHex(value: string): string {
  const { l, c, h, alpha } = parseOklch(value);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const encode = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  };
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const rgb = linear.map(encode).map(hex).join("");
  return alpha < 1 ? `#${rgb}${hex(Math.round(alpha * 255))}` : `#${rgb}`;
}

/** Any literal colour tokens.json may hold → hex for React Native. */
export function toHex(value: string): string {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.toLowerCase();
  if (value.trim().startsWith("oklch(")) return oklchToHex(value);
  throw new Error(`unsupported colour for native: ${value} (use hex or oklch)`);
}

// ---------------------------------------------------------------- lengths

/** `0.625rem` → 10, `16px` → 16 (1rem = 16px). */
export function toPx(value: string): number {
  const m = /^(-?[\d.]+)(px|rem)?$/.exec(value.trim());
  if (!m?.[1]) throw new Error(`not a px/rem length: ${value}`);
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

/** Line height in px: a length, or a unitless multiple of the font size. */
export function lineHeightPx(style: TextStyle): number {
  const size = toPx(style.fontSize);
  return /^[\d.]+$/.test(style.lineHeight)
    ? Math.round(size * Number(style.lineHeight))
    : toPx(style.lineHeight);
}

// ---------------------------------------------------------------- outputs

export const GENERATED =
  "Generated from packages/design/tokens.json by `pnpm design:build`. Do not edit.";

/**
 * Web: CSS variables for apps/web (imported by globals.css). Light on :root,
 * dark overrides on .dark (the class the app's `dark:` variant uses).
 */
export function toWebCss(tokens: Tokens): string {
  const [first, ...rest] = tokens.color.themes.map((t) => t.id);
  if (!first) throw new Error("tokens.json defines no themes");
  const css = (value: string) => {
    const alias = ALIAS.exec(value);
    return alias ? `var(--${alias[1]})` : value;
  };
  const lines = [`/* ${GENERATED} */`, ":root {"];
  for (const t of tokens.color.tokens)
    lines.push(`  --${t.name}: ${css(themeValue(tokens, t, first))};`);
  for (const t of [...tokens.radius.tokens, ...tokens.spacing.tokens])
    lines.push(`  --${t.name}: ${t.value};`);
  lines.push("}");
  for (const theme of rest) {
    const changed = tokens.color.tokens.filter(
      (t) => themeValue(tokens, t, theme) !== themeValue(tokens, t, first),
    );
    if (changed.length === 0) continue;
    lines.push("", `.${theme} {`);
    for (const t of changed) lines.push(`  --${t.name}: ${css(themeValue(tokens, t, theme))};`);
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}

/** The design-system artifact's tokens.css (its "compiled" layout: themes by data-theme). */
export function toSystemCss(tokens: Tokens, title: string): string {
  const [first, ...rest] = tokens.color.themes.map((t) => t.id);
  const css = (value: string) => {
    const alias = ALIAS.exec(value);
    return alias ? `var(--${alias[1]})` : value;
  };
  const lines = [`/* ${title} — generated from tokens.json */`, `:root, [data-theme="${first}"] {`];
  for (const t of tokens.color.tokens)
    lines.push(`  --${t.name}: ${css(themeValue(tokens, t, first ?? ""))};`);
  lines.push("}");
  for (const theme of rest) {
    lines.push(`[data-theme="${theme}"] {`);
    for (const t of tokens.color.tokens) {
      const v = themeValue(tokens, t, theme);
      if (v !== themeValue(tokens, t, first ?? "") || ALIAS.test(v))
        lines.push(`  --${t.name}: ${css(v)};`);
    }
    lines.push("}");
  }
  lines.push(":root {");
  for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens])
    lines.push(`  --${t.name}: ${t.value};`);
  for (const [key, stack] of Object.entries(tokens.type.families))
    lines.push(`  --font-${key}: ${stack};`);
  lines.push("}");
  for (const group of tokens.type.groups) {
    for (const s of group.styles) {
      lines.push(
        `.${s.name} { font-family: var(--font-${s.family ?? group.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight}; }`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** First family of a CSS stack, unquoted: what React Native's fontFamily takes. */
export function primaryFamily(stack: string): string {
  return (stack.split(",")[0] ?? stack).trim().replace(/^["']|["']$/g, "");
}

/** Native: a typed module for React Native / Expo. Colours as hex, sizes as numbers (dp). */
export function toNativeTs(tokens: Tokens): string {
  const themes = tokens.color.themes.map((t) => t.id);
  const colors = Object.fromEntries(
    themes.map((theme) => [
      theme,
      Object.fromEntries(
        tokens.color.tokens.map((t) => [t.name, toHex(resolveColor(tokens, t.name, theme))]),
      ),
    ]),
  );
  const px = (family: { tokens: PlainToken[] }) =>
    Object.fromEntries(family.tokens.map((t) => [t.name, toPx(t.value)]));
  const textStyles = Object.fromEntries(
    tokens.type.groups.flatMap((g) =>
      g.styles.map((s) => [
        s.name,
        {
          fontFamily: primaryFamily(tokens.type.families[s.family ?? g.family] ?? ""),
          fontSize: toPx(s.fontSize),
          lineHeight: lineHeightPx(s),
          fontWeight: String(s.fontWeight),
        },
      ]),
    ),
  );
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  return `// ${GENERATED}
// For React Native (Expo): colours as hex (React Native has no oklch()), sizes in dp.
// Fonts: load Geist with expo-font; map "ui-monospace" to the platform's monospace.

export const themes = ${json(themes)} as const;
export type Theme = (typeof themes)[number];

export const colors = ${json(colors)} as const;
export type ColorName = keyof (typeof colors)["${themes[0]}"];

/** Spacing base in dp: multiply for every gap and padding (4 × spacing = 16). */
export const spacing = ${json(px(tokens.spacing))} as const;

/** Radius base in dp; cards use 1.4×, pills are fully round. */
export const radius = ${json(px(tokens.radius))} as const;

export const textStyles = ${json(textStyles)} as const;
export type TextStyleName = keyof typeof textStyles;
`;
}
