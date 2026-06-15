import { describe, it, expect, afterEach } from "vitest";
import { loadSampleData, mapStage, sampleDataAllowlist } from "@/lib/sample-data";
import type { Stage } from "@/lib/crm/types";

afterEach(() => {
  delete process.env.SAMPLE_DATA_EMAILS;
  delete process.env.OPERATOR_EMAIL;
});

describe("sample-data allowlist — operator only", () => {
  it("defaults to the founder's address so demo data can't leak to real users", () => {
    expect(sampleDataAllowlist()).toEqual(["jmtrades1990@gmail.com"]);
  });
  it("honors SAMPLE_DATA_EMAILS (comma list, normalized), then OPERATOR_EMAIL", () => {
    process.env.SAMPLE_DATA_EMAILS = "A@x.com, b@y.com";
    expect(sampleDataAllowlist()).toEqual(["a@x.com", "b@y.com"]);
    delete process.env.SAMPLE_DATA_EMAILS;
    process.env.OPERATOR_EMAIL = "Owner@Co.com";
    expect(sampleDataAllowlist()).toEqual(["owner@co.com"]);
  });
});

const stage = (id: string, type: Stage["type"], probability = 0.5): Stage => ({ id, label: id, probability, type });

describe("mapStage — seed stages land sanely on a customized org pipeline", () => {
  const seedOpen = [stage("s1", "open"), stage("s2", "open"), stage("s3", "open"), stage("s4", "open")];

  it("won and lost map to the org's won/lost stages", () => {
    const org = [stage("o1", "open"), stage("w", "won"), stage("l", "lost")];
    expect(mapStage(stage("won_x", "won"), seedOpen, org)).toBe("w");
    expect(mapStage(stage("lost_x", "lost"), seedOpen, org)).toBe("l");
  });

  it("open stages map by relative position when the org has fewer stages", () => {
    const org = [stage("first", "open"), stage("second", "open"), stage("w", "won")];
    expect(mapStage(seedOpen[0], seedOpen, org)).toBe("first");
    expect(mapStage(seedOpen[3], seedOpen, org)).toBe("second");
  });

  it("falls back to the first open stage for an unknown stage", () => {
    const org = [stage("first", "open"), stage("w", "won")];
    expect(mapStage(undefined, seedOpen, org)).toBe("first");
  });

  it("never crashes on a pipeline without won/lost stages", () => {
    const org = [stage("only", "open")];
    expect(mapStage(stage("won_x", "won"), seedOpen, org)).toBe("only");
  });
});

describe("loadSampleData — duplicate guard", () => {
  it("no-ops on a workspace that already has contacts (demo store is pre-seeded)", async () => {
    const res = await loadSampleData();
    expect(res).toEqual({ contacts: 0, deals: 0 });
  });
});
