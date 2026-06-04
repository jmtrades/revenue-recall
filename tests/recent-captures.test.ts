import { describe, it, expect } from "vitest";
import { getRecentCaptures } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";

describe("getRecentCaptures", () => {
  it("returns only API/form-sourced deals, newest first, with the contact name", async () => {
    const provider = getProvider();
    const pipelines = await provider.listPipelines();
    const stage = pipelines[0].stages.find((s) => s.type === "open") ?? pipelines[0].stages[0];
    const contact = await provider.createContact({ name: `Cap ${Date.now()}`, points: [{ channel: "email", value: `cap-${Date.now()}@a.com` }] });

    const base = { pipelineId: pipelines[0].id, stageId: stage.id, currency: "USD", contactId: contact.id };
    await provider.createOpportunity({ ...base, title: "Via API", value: 100, source: "API" });
    await provider.createOpportunity({ ...base, title: "Via Form", value: 200, source: "Web form" });
    await provider.createOpportunity({ ...base, title: "Manual", value: 300, source: "Manual entry" });

    const rows = await getRecentCaptures(50);
    const mine = rows.filter((r) => r.contactName === contact.name);
    expect(mine.length).toBe(2); // the "Manual" one is excluded
    expect(mine.every((r) => r.source === "API" || r.source === "Web form")).toBe(true);
    expect(mine.some((r) => r.title === "Via API")).toBe(true);
    expect(mine.some((r) => r.title === "Manual")).toBe(false);
  });
});
