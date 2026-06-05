import { describe, it, expect } from "vitest";
import { dropOptedOutRecall } from "@/lib/queries";
import type { Activity, Contact, Opportunity } from "@/lib/crm/types";
import type { RecallItem } from "@/lib/recall/engine";

const item = (opportunityId: string): RecallItem => ({ opportunityId, title: "Deal", value: 1000, currency: "USD", weightedValue: 500, daysSinceActivity: 20, reason: "going_cold", score: 50, recommendation: "follow up", channel: "call", engaged: false, overdue: false });
const opp = (id: string, contactId: string): Opportunity => ({ id, title: "Deal", value: 1000, currency: "USD", contactId, pipelineId: "p", stageId: "s", createdAt: "", updatedAt: "" } as Opportunity);
const contact = (id: string): Contact => ({ id, name: "Lead", points: [{ channel: "phone", value: "+15550000000" }] } as Contact);
const inbound = (summary: string): Activity => ({ id: "a", kind: "sms", direction: "inbound", summary, occurredAt: new Date().toISOString() } as Activity);

describe("recall queue excludes opted-out contacts", () => {
  const oppById = new Map([["o1", opp("o1", "c1")]]);
  const cById = new Map([["c1", contact("c1")]]);

  it("keeps a contact who hasn't opted out", () => {
    const out = dropOptedOutRecall([item("o1")], oppById, cById, new Map());
    expect(out).toHaveLength(1);
  });

  it("drops a contact with a hard opt-out on the timeline", () => {
    const acts = new Map<string, Activity[]>([["c1", [inbound("please stop texting me, unsubscribe")]]]);
    const out = dropOptedOutRecall([item("o1")], oppById, cById, acts);
    expect(out).toHaveLength(0);
  });

  it("keeps items it can't resolve (missing opp/contact) rather than dropping silently", () => {
    expect(dropOptedOutRecall([item("missing")], oppById, cById, new Map())).toHaveLength(1);
  });
});
