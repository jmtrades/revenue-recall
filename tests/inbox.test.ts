import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Activity, Contact, Opportunity, Pipeline } from "@/lib/crm/types";

// Drive getInbox through a stub provider so we can assert the channel parsing
// and grouping without a real CRM.
const state: { contacts: Contact[]; activities: Activity[]; opportunities: Opportunity[]; pipelines: Pipeline[] } = {
  contacts: [], activities: [], opportunities: [], pipelines: [],
};

vi.mock("@/lib/crm/registry", () => {
  const fake = () => ({
    listContacts: async () => state.contacts,
    listRecentActivities: async (limit: number) =>
      state.activities.slice().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, limit),
    listOpportunities: async () => state.opportunities,
    listPipelines: async () => state.pipelines,
  });
  return { getProvider: fake, resolveProvider: async () => fake() };
});

import { getInbox } from "@/lib/queries";

function contact(id: string, name: string, attributes?: Contact["attributes"]): Contact {
  return { id, name, points: [], attributes };
}
function act(over: Partial<Activity> & { id: string; contactId: string; kind: Activity["kind"] }): Activity {
  return { summary: "", occurredAt: new Date().toISOString(), ...over };
}

beforeEach(() => {
  state.contacts = [];
  state.activities = [];
  state.opportunities = [];
  state.pipelines = [];
});

describe("unified inbox", () => {
  it("surfaces a social DM that created a contact but no deal", async () => {
    state.contacts = [contact("c1", "Ada", { "social:whatsapp": "wa_1" })];
    state.activities = [
      act({ id: "a1", contactId: "c1", kind: "note", summary: "[Whatsapp] hey, is this still available?", direction: "inbound", occurredAt: "2026-05-01T10:00:00.000Z" }),
    ];
    const threads = await getInbox();
    expect(threads).toHaveLength(1);
    const t = threads[0];
    expect(t.contactId).toBe("c1");
    expect(t.channel).toBe("whatsapp"); // recovered from the [Platform] tag
    expect(t.snippet).toBe("hey, is this still available?"); // tag stripped
    expect(t.unread).toBe(true); // last message was inbound
    expect(t.messages[0].channel).toBe("whatsapp");
    expect(t.messages[0].body).toBe("hey, is this still available?");
    expect(t.deal).toBeUndefined(); // contact-only DM, no deal context
  });

  it("attaches the contact's primary deal as inline context", async () => {
    state.contacts = [contact("c1", "Ada")];
    state.activities = [act({ id: "a1", contactId: "c1", kind: "email", summary: "hi", direction: "inbound", occurredAt: "2026-05-01T10:00:00.000Z" })];
    state.pipelines = [{ id: "p", name: "Sales", stages: [{ id: "open", label: "In play", probability: 0.4, type: "open" }] }];
    state.opportunities = [
      { id: "o1", title: "Listing on Elm St", pipelineId: "p", stageId: "open", value: 12000, currency: "USD", contactId: "c1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ];
    const t = (await getInbox())[0];
    expect(t.deal).toMatchObject({ dealId: "o1", title: "Listing on Elm St", stage: "In play", stageType: "open", value: 12000, currency: "USD" });
  });

  it("keeps email/sms/call channels intact and groups by contact", async () => {
    state.contacts = [contact("c2", "Grace")];
    state.activities = [
      act({ id: "b1", contactId: "c2", kind: "email", summary: "Sent pricing", direction: "outbound", occurredAt: "2026-05-01T09:00:00.000Z" }),
      act({ id: "b2", contactId: "c2", kind: "sms", summary: "quick follow up", direction: "outbound", occurredAt: "2026-05-02T09:00:00.000Z" }),
    ];
    const threads = await getInbox();
    expect(threads).toHaveLength(1);
    expect(threads[0].channel).toBe("sms"); // newest wins
    expect(threads[0].messages.map((m) => m.channel)).toEqual(["email", "sms"]); // oldest-first
  });

  it("orders threads newest-first and ignores non-message activity", async () => {
    state.contacts = [contact("c3", "Old"), contact("c4", "New")];
    state.activities = [
      act({ id: "c3a", contactId: "c3", kind: "email", summary: "older", occurredAt: "2026-04-01T00:00:00.000Z" }),
      act({ id: "c4a", contactId: "c4", kind: "email", summary: "newer", occurredAt: "2026-05-10T00:00:00.000Z" }),
      act({ id: "x1", contactId: "c4", kind: "stage_change", summary: "Moved to Won", occurredAt: "2026-05-11T00:00:00.000Z" }),
    ];
    const threads = await getInbox();
    expect(threads.map((t) => t.contactId)).toEqual(["c4", "c3"]);
    // stage_change is not a message, so c4's thread channel stays email.
    expect(threads[0].channel).toBe("email");
  });
});
