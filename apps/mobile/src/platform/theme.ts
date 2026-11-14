/**
 * Design tokens for React Native, from @app/design's generated TypeScript
 * export (tokens.json is the one source). Views style with these, never with
 * colour or size literals.
 */
import {
  colors,
  radius as radiusTokens,
  spacing,
  type TextStyleName,
  textStyles,
} from "@app/design";
import { StyleSheet } from "react-native";

/** Light only, like the web app: dark mode is not offered yet. */
export const color = colors.light;

/** Multiples of the spacing base, as Tailwind's `p-4` is 4 × spacing. */
export const space = (steps: number) => steps * spacing.spacing;

export const radius = {
  base: radiusTokens.radius,
  /** Cards use 1.4 × the base (the design system's README). */
  card: radiusTokens.radius * 1.4,
  /** Badges and progress bars are fully round. */
  full: 9999,
};

/** The web's 1px hairlines (`border`). */
export const hairline = StyleSheet.hairlineWidth;

/** `#rrggbb` at an opacity, e.g. the 10% foreground ring around cards. */
export function withAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 7)}${alpha}`;
}

/**
 * A text style token. Geist isn't bundled yet (expo-font is postponed), so the
 * family is dropped and the system face is used; size, line height and weight
 * come from the token.
 */
export function text(name: TextStyleName) {
  const { fontFamily: _family, ...style } = textStyles[name];
  return style;
}
