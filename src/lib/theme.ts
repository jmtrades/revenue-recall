import type { CSSProperties } from "react";

/**
 * Per-org appearance. The accent drives every `brand`/`brand-soft` Tailwind
 * utility via CSS variables, so picking a color re-themes the whole app chrome
 * (nav, buttons, links, badges, focus rings) with no rebuild. Accents are a
 * curated palette referenced by key — never a raw user-supplied color — so
 * there's nothing to sanitize and the result always stays on-brand.
 */

export interface Accent {
  label: string;
  /** Space-separated RGB triplet for `rgb(var(--brand-rgb) / <alpha>)` (dark theme). */
  brand: string;
  /** Muted companion used by `*-brand-soft` surfaces (dark theme). */
  soft: string;
  /** Light-theme brand — deepened so text/icons stay readable on ivory. */
  brandLight: string;
  /** Light-theme soft — a pale wash of the hue (the dark soft reads as a black blob on ivory). */
  softLight: string;
  /** Solid swatch for the picker. */
  hex: string;
}

export const ACCENTS = {
  emerald: { label: "Money", brand: "5 150 105", soft: "12 45 33", brandLight: "4 120 87", softLight: "209 240 226", hex: "#059669" },
  indigo: { label: "Indigo", brand: "91 140 255", soft: "42 58 102", brandLight: "59 91 219", softLight: "224 231 255", hex: "#5b8cff" },
  violet: { label: "Violet", brand: "167 139 250", soft: "58 46 102", brandLight: "109 40 217", softLight: "237 233 254", hex: "#a78bfa" },
  mint: { label: "Mint", brand: "52 211 153", soft: "20 71 58", brandLight: "13 148 136", softLight: "204 251 241", hex: "#34d399" },
  rose: { label: "Rose", brand: "251 113 133", soft: "92 38 51", brandLight: "225 29 72", softLight: "255 228 230", hex: "#fb7185" },
  amber: { label: "Amber", brand: "245 178 38", soft: "84 60 12", brandLight: "180 83 9", softLight: "254 243 199", hex: "#f5b226" },
  cyan: { label: "Cyan", brand: "34 211 238", soft: "16 68 80", brandLight: "14 116 144", softLight: "207 250 254", hex: "#22d3ee" },
  slate: { label: "Graphite", brand: "148 163 184", soft: "51 65 85", brandLight: "71 85 105", softLight: "226 232 240", hex: "#94a3b8" },
} satisfies Record<string, Accent>;

export type AccentKey = keyof typeof ACCENTS;
export const ACCENT_KEYS = Object.keys(ACCENTS) as [AccentKey, ...AccentKey[]];
export const DEFAULT_ACCENT: AccentKey = "emerald";

/** Appearance mode. "system" follows the OS preference (resolved on the client). */
export type ThemeMode = "dark" | "light" | "system";
export const THEME_MODES = ["dark", "light", "system"] as [ThemeMode, ...ThemeMode[]];
export const DEFAULT_MODE: ThemeMode = "dark";

export interface Theme {
  accent: AccentKey;
  mode: ThemeMode;
}

export function defaultTheme(): Theme {
  return { accent: DEFAULT_ACCENT, mode: DEFAULT_MODE };
}

export function isAccentKey(v: unknown): v is AccentKey {
  return typeof v === "string" && v in ACCENTS;
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "dark" || v === "light" || v === "system";
}

/** Merge a stored (untrusted) theme blob over the defaults. */
export function mergeTheme(stored?: Record<string, unknown> | Theme | null): Theme {
  const theme = defaultTheme();
  const s = stored as { accent?: unknown; mode?: unknown } | null | undefined;
  if (isAccentKey(s?.accent)) theme.accent = s!.accent;
  if (isThemeMode(s?.mode)) theme.mode = s!.mode;
  return theme;
}

/** CSS custom properties to spread onto a wrapper element so children inherit the accent.
 *  Deliberately sets SOURCE variables (dark + light) rather than --brand-rgb itself:
 *  the stylesheet's :root / [data-theme="light"] rules pick the right pair, so the
 *  accent follows live theme switches (including "system") without any JS. */
export function accentVars(accent: AccentKey): CSSProperties {
  const a = ACCENTS[accent] ?? ACCENTS[DEFAULT_ACCENT];
  return {
    "--brand-dark": a.brand,
    "--brand-soft-dark": a.soft,
    "--brand-light": a.brandLight,
    "--brand-soft-light": a.softLight,
  } as CSSProperties;
}
