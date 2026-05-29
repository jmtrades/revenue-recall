import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the fake batch API per test.
let status = "in_progress";
let rows: unknown[] = [];
const created: unknown[] = [];

const fakeClient = {
  messages: {
    batches: {
      create: async (b: unknown) => { created.push(b); return { id: "batch_test_1" }; },
      retrieve: async () => ({ processing_status: status }),
      // eslint-disable-next-line require-yield
      results: async () => (async function* () { for (const r of rows) yield r; })(),
    },
  },
};

vi.mock("@/lib/ai/client", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, getAnthropic: () => fakeClient };
});

import { submitDraftBatch, collectBatch, listPendingBatches, __resetBatchesForTests, type BatchDraftRequest } from "@/lib/ai/batch";
import { _resetUsage } from "@/lib/ai/usage";

const req = (customId: string, channel: "email" | "sms", dealId?: string): BatchDraftRequest => ({
  item: { customId, dealId, contactId: "c1", channel },
  input: { channel, contactName: "Jordan", dealTitle: "Acme", valueLabel: "ARR", value: 1000, currency: "USD", stageLabel: "Proposal", industryLabel: "SaaS", industryId: "generic" },
});

function succeeded(customId: string, body: string, subject?: string) {
  return { custom_id: customId, result: { type: "succeeded", message: { content: [{ type: "text", text: JSON.stringify({ subject, body }) }], usage: { input_tokens: 100, output_tokens: 50 } } } };
}

beforeEach(() => {
  __resetBatchesForTests();
  _resetUsage();
  created.length = 0;
  rows = [];
  status = "in_progress";
  delete process.env.AI_MONTHLY_BUDGET_USD;
});

describe("submitDraftBatch", () => {
  it("returns null for an empty request set without calling the API", async () => {
    expect(await submitDraftBatch([])).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("submits one batch with a custom_id per request and persists it pending", async () => {
    const id = await submitDraftBatch([req("e1:0", "email", "d1"), req("e2:0", "sms")]);
    expect(id).toBe("batch_test_1");
    const body = created[0] as { requests: { custom_id: string; params: unknown }[] };
    expect(body.requests.map((r) => r.custom_id)).toEqual(["e1:0", "e2:0"]);
    expect(body.requests[0].params).toBeTruthy(); // built message params
    const pending = await listPendingBatches();
    expect(pending).toHaveLength(1);
    expect(pending[0].items.map((i) => i.customId)).toEqual(["e1:0", "e2:0"]);
  });

  it("does not submit when over budget", async () => {
    process.env.AI_MONTHLY_BUDGET_USD = "1";
    // push spend over the cap
    const { recordUsage } = await import("@/lib/ai/usage");
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 0, outputTokens: 0, costUsd: 2, feature: "draft" });
    expect(await submitDraftBatch([req("e1:0", "email")])).toBeNull();
  });
});

describe("collectBatch", () => {
  it("returns null while the batch is still processing", async () => {
    await submitDraftBatch([req("e1:0", "email", "d1")]);
    status = "in_progress";
    expect(await collectBatch("batch_test_1")).toBeNull();
  });

  it("returns parsed drafts once ended, routed to their items", async () => {
    await submitDraftBatch([req("e1:0", "email", "d1"), req("e2:0", "sms")]);
    status = "ended";
    rows = [succeeded("e1:0", "Hi Jordan, following up.", "quick note"), succeeded("e2:0", "hey, free this week?")];
    const out = await collectBatch("batch_test_1");
    expect(out).toHaveLength(2);
    const email = out!.find((d) => d.item.customId === "e1:0")!;
    expect(email.item.dealId).toBe("d1");
    expect(email.subject).toBe("quick note");
    expect(email.body).toContain("following up");
    const sms = out!.find((d) => d.item.customId === "e2:0")!;
    expect(sms.subject).toBeUndefined(); // sms carries no subject
  });

  it("drops errored, malformed, and unknown-custom_id results", async () => {
    await submitDraftBatch([req("e1:0", "email")]);
    status = "ended";
    rows = [
      { custom_id: "e1:0", result: { type: "errored", error: { type: "x" } } },
      { custom_id: "e1:0", result: { type: "succeeded", message: { content: [{ type: "text", text: "not json" }] } } },
      succeeded("ghost:9", "orphan body"),
    ];
    const out = await collectBatch("batch_test_1");
    expect(out).toEqual([]);
  });
});
