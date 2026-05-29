import { describe, it, expect } from "vitest";
import { ACCENTS, ACCENT_KEYS, DEFAULT_ACCENT, DEFAULT_MODE, accentVars, defaultTheme, isAccentKey, isThemeMode, mergeTheme } from "@/lib/theme";

describe("appearance theme", () => {
  it("defaults to the canonical accent and mode", () => {
    expect(defaultTheme()).toEqual({ accent: DEFAULT_ACCENT, mode: DEFAULT_MODE });
    expect(ACCENT_KEYS).toContain(DEFAULT_ACCENT);
  });

  it("every accent declares a valid rgb triplet and hex swatch", () => {
    for (const key of ACCENT_KEYS) {
      const a = ACCENTS[key];
      expect(a.brand).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(a.soft).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
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

  it("exposes accent as CSS custom properties for the shell", () => {
    const vars = accentVars("rose") as Record<string, string>;
    expect(vars["--brand-rgb"]).toBe(ACCENTS.rose.brand);
    expect(vars["--brand-soft-rgb"]).toBe(ACCENTS.rose.soft);
  });
});
