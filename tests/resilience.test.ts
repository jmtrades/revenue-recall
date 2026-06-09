import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Contact, Opportunity, Pipeline, User } from "@/lib/crm/types";

/**
 * Reliability: a provider returning ZERO pipelines (empty/transient read, an
 * HTTP-CRM endpoint with no pipelines, a just-connected source) must not crash
 * the dashboard/board — they fall back to the industry template pipeline so
 * every surface keeps rendering instead of throwing.
 */
const empty: { pipelines: Pipeline[]; opps: Opportunity[]; contacts: Contact[]; users: User[] } = {
  pipelines: [],
  opps: [],
  contacts: [],
  users: [],
};

vi.mock("@/lib/crm/registry", () => {
  // One full fake for both entry points — the data paths now resolve the
  // provider asynchronously, so the async mock must expose every method too.
  const fake = () => ({
    info: () => ({ id: "test", label: "Test", capabilities: { read: true, write: true, activities: true, customFields: true }, ready: true }),
    listPipelines: async () => empty.pipelines,
    listOpportunities: async () => empty.opps,
    listContacts: async () => empty.contacts,
    listUsers: async () => empty.users,
    listActivities: async () => [],
    listRecentActivities: async () => [],
  });
  return { getProvider: fake, resolveProvider: async () => fake() };
});

import { getOverview, getBoard, getTeamAndPipeline, safePipeline } from "@/lib/queries";

beforeEach(() => {
  empty.pipelines = [];
});

describe("safePipeline fallback", () => {
  it("returns the industry template pipeline when the provider has none", () => {
    const p = safePipeline([]);
    expect(p).toBeTruthy();
    expect(p.stages.length).toBeGreaterThan(0);
    expect(p.stages.some((s) => s.type === "open")).toBe(true);
  });

  it("returns the provider's pipeline when present", () => {
    const custom: Pipeline = { id: "x", label: "Custom", stages: [{ id: "s1", label: "S1", probability: 0.5, type: "open" }] };
    expect(safePipeline([custom]).id).toBe("x");
  });
});

describe("page loaders survive an empty provider", () => {
  it("getOverview does not throw with zero pipelines", async () => {
    const o = await getOverview();
    expect(o.pipeline).toBeTruthy();
    expect(o.pipeline.stages.length).toBeGreaterThan(0);
    expect(o.metrics).toBeTruthy();
    expect(Array.isArray(o.recall)).toBe(true);
  });

  it("getBoard does not throw with zero pipelines", async () => {
    const b = await getBoard();
    expect(b.pipeline).toBeTruthy();
    expect(b.pipeline.stages.length).toBeGreaterThan(0);
  });

  it("getTeamAndPipeline does not throw with zero pipelines", async () => {
    const t = await getTeamAndPipeline();
    expect(t.pipeline).toBeTruthy();
    expect(t.pipeline.stages.length).toBeGreaterThan(0);
  });
});
