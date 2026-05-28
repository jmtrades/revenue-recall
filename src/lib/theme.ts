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
  /** Space-separated RGB triplet for `rgb(var(--brand-rgb) / <alpha>)`. */
  brand: string;
  /** Muted companion used by `*-brand-soft` surfaces. */
  soft: string;
  /** Solid swatch for the picker. */
  hex: string;
}

export const ACCENTS = {
  indigo: { label: "Indigo", brand: "91 140 255", soft: "42 58 102", hex: "#5b8cff" },
  violet: { label: "Violet", brand: "167 139 250", soft: "58 46 102", hex: "#a78bfa" },
  emerald: { label: "Emerald", brand: "52 211 153", soft: "20 71 58", hex: "#34d399" },
  rose: { label: "Rose", brand: "251 113 133", soft: "92 38 51", hex: "#fb7185" },
  amber: { label: "Amber", brand: "245 178 38", soft: "84 60 12", hex: "#f5b226" },
  cyan: { label: "Cyan", brand: "34 211 238", soft: "16 68 80", hex: "#22d3ee" },
  slate: { label: "Graphite", brand: "148 163 184", soft: "51 65 85", hex: "#94a3b8" },
} satisfies Record<string, Accent>;

export type AccentKey = keyof typeof ACCENTS;
export const ACCENT_KEYS = Object.keys(ACCENTS) as [AccentKey, ...AccentKey[]];
export const DEFAULT_ACCENT: AccentKey = "indigo";

export interface Theme {
  accent: AccentKey;
}

export function defaultTheme(): Theme {
  return { accent: DEFAULT_ACCENT };
}

export function isAccentKey(v: unknown): v is AccentKey {
  return typeof v === "string" && v in ACCENTS;
}

/** Merge a stored (untrusted) theme blob over the defaults. */
export function mergeTheme(stored?: Record<string, unknown> | Theme | null): Theme {
  const theme = defaultTheme();
  const accent = (stored as { accent?: unknown } | null | undefined)?.accent;
  if (isAccentKey(accent)) theme.accent = accent;
  return theme;
}

/** CSS custom properties to spread onto a wrapper element so children inherit the accent. */
export function accentVars(accent: AccentKey): CSSProperties {
  const a = ACCENTS[accent] ?? ACCENTS[DEFAULT_ACCENT];
  return { "--brand-rgb": a.brand, "--brand-soft-rgb": a.soft } as CSSProperties;
}
