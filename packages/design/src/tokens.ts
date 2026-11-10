// Generated from packages/design/tokens.json by `pnpm design:build`. Do not edit.
// For React Native (Expo): colours as hex (React Native has no oklch()), sizes in dp.
// Fonts: load Geist with expo-font; map "ui-monospace" to the platform's monospace.

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const colors = {
  light: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    "card-foreground": "#0a0a0a",
    popover: "#ffffff",
    "popover-foreground": "#0a0a0a",
    primary: "#171717",
    "primary-foreground": "#fafafa",
    secondary: "#f5f5f5",
    "secondary-foreground": "#171717",
    muted: "#f5f5f5",
    "muted-foreground": "#737373",
    accent: "#f5f5f5",
    "accent-foreground": "#171717",
    destructive: "#e7000b",
    border: "#e5e5e5",
    input: "#e5e5e5",
    ring: "#a1a1a1",
    "chart-1": "#d4d4d4",
    "chart-2": "#737373",
    "chart-3": "#525252",
    "chart-4": "#404040",
    "chart-5": "#262626",
    sidebar: "#fafafa",
    "sidebar-foreground": "#0a0a0a",
    "sidebar-primary": "#171717",
    "sidebar-primary-foreground": "#fafafa",
    "sidebar-accent": "#f5f5f5",
    "sidebar-accent-foreground": "#171717",
    "sidebar-border": "#e5e5e5",
    "sidebar-ring": "#a1a1a1",
    "verdict-exact": "#00a63e",
    "verdict-typo": "#fe9a00",
    "verdict-wrong": "#e7000b",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    card: "#171717",
    "card-foreground": "#fafafa",
    popover: "#171717",
    "popover-foreground": "#fafafa",
    primary: "#e5e5e5",
    "primary-foreground": "#171717",
    secondary: "#262626",
    "secondary-foreground": "#fafafa",
    muted: "#262626",
    "muted-foreground": "#a1a1a1",
    accent: "#262626",
    "accent-foreground": "#fafafa",
    destructive: "#ff6467",
    border: "#ffffff1a",
    input: "#ffffff26",
    ring: "#737373",
    "chart-1": "#d4d4d4",
    "chart-2": "#737373",
    "chart-3": "#525252",
    "chart-4": "#404040",
    "chart-5": "#262626",
    sidebar: "#171717",
    "sidebar-foreground": "#fafafa",
    "sidebar-primary": "#1447e6",
    "sidebar-primary-foreground": "#fafafa",
    "sidebar-accent": "#262626",
    "sidebar-accent-foreground": "#fafafa",
    "sidebar-border": "#ffffff1a",
    "sidebar-ring": "#737373",
    "verdict-exact": "#00a63e",
    "verdict-typo": "#fe9a00",
    "verdict-wrong": "#ff6467",
  },
} as const;
export type ColorName = keyof (typeof colors)["light"];

/** Spacing base in dp: multiply for every gap and padding (4 × spacing = 16). */
export const spacing = {
  spacing: 4,
} as const;

/** Radius base in dp; cards use 1.4×, pills are fully round. */
export const radius = {
  radius: 10,
} as const;

export const textStyles = {
  term: {
    fontFamily: "Geist",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "600",
  },
  prompt: {
    fontFamily: "Geist",
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
  },
  definition: {
    fontFamily: "Geist",
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "400",
  },
  "page-title": {
    fontFamily: "Geist",
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
  },
  "card-title": {
    fontFamily: "Geist",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  body: {
    fontFamily: "Geist",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  label: {
    fontFamily: "Geist",
    fontSize: 14,
    lineHeight: 14,
    fontWeight: "500",
  },
  caption: {
    fontFamily: "Geist",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  badge: {
    fontFamily: "Geist",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  code: {
    fontFamily: "ui-monospace",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
} as const;
export type TextStyleName = keyof typeof textStyles;
