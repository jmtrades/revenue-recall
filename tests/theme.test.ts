import { describe, it, expect } from "vitest";
import { ACCENTS, ACCENT_KEYS, DEFAULT_ACCENT, DEFAULT_MODE, accentVars, defaultTheme, isAccentKey, isThemeMode, mergeTheme } from "@/lib/theme";

describe("appearance theme", () => {
  it("defaults to the canonical accent and mode", () => {
    expect(defaultTheme()).toEqual({ accent: DEFAULT_ACCENT, mode: DEFAULT_MODE });
    expect(ACCENT_KEYS).toContain(DEFAULT_ACCENT);
  });

  it("every accent declares valid rgb triplets (both theme pairs) and a hex swatch", () => {
    for (const key of ACCENT_KEYS) {
      const a = ACCENTS[key];
      expect(a.brand).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.soft).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.brandLight).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.softLight).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("merges a stored accent + mode and ignores anything invalid", () => {
    expect(mergeTheme({ accent: "emerald" }).accent).toBe("emerald");
    expect(mergeTheme({ accent: "not-a-color" }).accent).toBe(DEFAULT_ACCENT);
    expect(mergeTheme({ mode: "light" }).mode).toBe("light");
    expect(mergeTheme({ mode: "bogus" }).mode).toBe(DEFAULT_MODE);
    expect(mergeTheme({ accent: "rose", mode: "system" })).toEqual({ accent: "rose", mode: "system" });
    expect(mergeTheme(null)).toEqual(defaultTheme());
    expect(mergeTheme({}).accent).toBe(DEFAULT_ACCENT);
  });

  it("guards palette and mode", () => {
    expect(isAccentKey("violet")).toBe(true);
    expect(isAccentKey("chartreuse")).toBe(false);
    expect(isAccentKey(42)).toBe(false);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
  });

  it("exposes accent as theme-pair source variables for the shell", () => {
    // accentVars sets SOURCE vars (dark + light pairs), not --brand-rgb itself —
    // the stylesheet's :root/[data-theme] rules resolve the active pair, so the
    // accent follows live theme switches (including "system") without JS.
    const vars = accentVars("rose") as Record<string, string>;
    expect(vars["--brand-dark"]).toBe(ACCENTS.rose.brand);
    expect(vars["--brand-soft-dark"]).toBe(ACCENTS.rose.soft);
    expect(vars["--brand-light"]).toBe(ACCENTS.rose.brandLight);
    expect(vars["--brand-soft-light"]).toBe(ACCENTS.rose.softLight);
  });
});
