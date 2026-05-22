import { describe, it, expect } from "vitest";
import { seedDataset } from "@/lib/data/seed";
import { INDUSTRIES, getIndustry } from "@/lib/industries";

describe("industries", () => {
  it("falls back to the generic template for unknown ids", () => {
    expect(getIndustry("does-not-exist").id).toBe("generic");
  });

  it("every industry has exactly one won and one lost stage", () => {
    for (const ind of INDUSTRIES) {
      const won = ind.pipeline.stages.filter((s) => s.type === "won");
      const lost = ind.pipeline.stages.filter((s) => s.type === "lost");
      expect(won.length, `${ind.id} won`).toBe(1);
      expect(lost.length, `${ind.id} lost`).toBe(1);
    }
  });

  it("probabilities are within 0..1 and won=1, lost=0", () => {
    for (const ind of INDUSTRIES) {
      for (const s of ind.pipeline.stages) {
        expect(s.probability).toBeGreaterThanOrEqual(0);
        expect(s.probability).toBeLessThanOrEqual(1);
        if (s.type === "won") expect(s.probability).toBe(1);
        if (s.type === "lost") expect(s.probability).toBe(0);
      }
    }
  });
});

describe("seedDataset", () => {
  it("is deterministic for a given industry", () => {
    const a = seedDataset("real_estate");
    const b = seedDataset("real_estate");
    expect(a.contacts.length).toBe(b.contacts.length);
    expect(a.opportunities.map((o) => o.id)).toEqual(b.opportunities.map((o) => o.id));
    expect(a.opportunities[0].value).toBe(b.opportunities[0].value);
  });

  it("produces contacts, opportunities, and a realistic activity history", () => {
    const ds = seedDataset("saas");
    expect(ds.contacts.length).toBeGreaterThan(0);
    expect(ds.opportunities.length).toBe(ds.contacts.length);
    expect(ds.activities.length).toBeGreaterThan(ds.opportunities.length);
    expect(ds.pipelines).toHaveLength(1);
  });

  it("includes stale and lost deals so the recall engine has candidates", () => {
    const ds = seedDataset("real_estate");
    const lostStage = ds.pipelines[0].stages.find((s) => s.type === "lost")!;
    const hasLost = ds.opportunities.some((o) => o.stageId === lostStage.id);
    const hasStale = ds.opportunities.some(
      (o) => o.lastActivityAt && Date.now() - new Date(o.lastActivityAt).getTime() > 30 * 86400000,
    );
    expect(hasLost).toBe(true);
    expect(hasStale).toBe(true);
  });
});
