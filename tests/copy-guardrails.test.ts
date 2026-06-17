import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { exposesDivisibleUnits } from "@/lib/agent/guardrails";

describe("exposesDivisibleUnits", () => {
  it("flags exposed allowance unit counts", () => {
    for (const s of ["1,500 minutes", "5000 messages", "500 texts", "10,000 emails", "2,000 dials", "300 calls"]) {
      expect(exposesDivisibleUnits(s)).toBe(true);
    }
  });

  it("does NOT flag durations, term lengths, or unitless numbers", () => {
    for (const s of [
      "Live in minutes",
      "5 minute setup",
      "2 months free",
      "Cancel anytime",
      "70% gross margin",
      "$599/mo",
      "100% of your list",
      "works your whole list",
      "",
      null,
    ]) {
      expect(exposesDivisibleUnits(s)).toBe(false);
    }
  });
});

// The project's load-bearing rule: buyer-facing copy frames abundance, never
// divisible unit counts. Scan the real marketing + pricing source so a future
// edit reintroducing "1,500 minutes" fails CI instead of shipping.
describe("buyer-facing copy holds the pricing-copy bar", () => {
  const dirs = ["src/components/marketing", "src/app/pricing"];
  const files = dirs.flatMap((d) =>
    readdirSync(join(process.cwd(), d))
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => join(d, f)),
  );

  it("scans at least the core pricing files", () => {
    expect(files.some((f) => f.includes("PricingPlans"))).toBe(true);
    expect(files.some((f) => f.includes("pricing-data"))).toBe(true);
  });

  it.each(files)("%s exposes no divisible unit counts", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    expect(exposesDivisibleUnits(src), `${rel} exposes a divisible unit count`).toBe(false);
  });
});
