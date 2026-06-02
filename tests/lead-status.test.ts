import { describe, it, expect } from "vitest";
import { normalizeLeadStatus, isLeadStatus, leadStatusLabel, LEAD_STATUSES } from "@/lib/crm/lead-status";
import { setContactStatus } from "@/lib/leads";
import { getLeadRows } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";

describe("lead-status pure helpers", () => {
  it("recognizes valid statuses and rejects junk", () => {
    expect(isLeadStatus("qualified")).toBe(true);
    expect(isLeadStatus("banana")).toBe(false);
    expect(normalizeLeadStatus("working")).toBe("working");
    expect(normalizeLeadStatus(42)).toBeUndefined();
    expect(leadStatusLabel("customer")).toBe("Customer");
    expect(leadStatusLabel(undefined)).toBe("—");
    expect(LEAD_STATUSES.length).toBeGreaterThan(0);
  });
});

describe("setContactStatus (built-in CRM)", () => {
  it("persists status, merges attributes, and surfaces in lead rows", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({
      name: "Status McTest",
      points: [{ channel: "email", value: "status.test@example.com" }],
      attributes: { budget: "high" },
    });

    const result = await setContactStatus(contact.id, "qualified");
    expect(result).toBe("qualified");

    const fresh = await provider.getContact(contact.id);
    expect(fresh?.attributes?.status).toBe("qualified");
    // Existing attributes must survive the update (no clobber).
    expect(fresh?.attributes?.budget).toBe("high");

    const { rows } = await getLeadRows();
    expect(rows.find((r) => r.id === contact.id)?.status).toBe("qualified");
  });

  it("returns null for an unknown contact", async () => {
    expect(await setContactStatus("does-not-exist", "new")).toBeNull();
  });
});
