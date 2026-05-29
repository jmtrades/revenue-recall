import { getAnthropic, aiModel, buildMessageParams } from "@/lib/ai/client";
import { buildDraftUserPrompt, DRAFT_SYSTEM, DRAFT_SCHEMA, type DraftInput } from "@/lib/ai/draft";
import { costOf } from "@/lib/ai/cost";
import { recordUsage, budgetFraction } from "@/lib/ai/usage";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";

/**
 * Anthropic Batches API for bulk drafting (~50% cheaper, async). Opt-in via
 * SEQUENCE_BATCH=true on the cadence runtime. Because batches return
 * minutes-to-an-hour later, the flow is two-phase: submit + persist the routing
 * map now (submitDraftBatch), then a later cron tick collects results
 * (collectBatch) and the caller queues them to Approvals.
 *
 * Tradeoff vs the synchronous path: batched drafts skip the two-pass humanness
 * refine (no second call), so they run thinking at "medium" to stay sharp while
 * keeping the cost win. Use the synchronous path when top quality matters more
 * than cost.
 */

/** Routing info for one batched draft — maps a batch custom_id back to its target. */
export interface BatchDraftItem {
  customId: string;
  dealId?: string;
  contactId: string;
  channel: "email" | "sms";
}

export interface BatchDraftRequest {
  item: BatchDraftItem;
  input: DraftInput;
}

export interface PendingBatch {
  id: string;
  providerBatchId: string;
  items: BatchDraftItem[];
  status: "pending" | "collected" | "failed";
}

export interface CollectedDraft {
  item: BatchDraftItem;
  subject?: string;
  body: string;
}

const mem: PendingBatch[] = [];

/** Test-only: clear the in-memory batch store. */
export function __resetBatchesForTests(): void {
  mem.length = 0;
}

async function orgId(): Promise<string | null> {
  return (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
}

/**
 * Submit a set of draft requests as one Anthropic batch. Returns the provider
 * batch id (and persists a pending row), or null if AI is off / over budget /
 * the batch is empty. Best-effort: never throws into the cadence loop.
 */
export async function submitDraftBatch(requests: BatchDraftRequest[]): Promise<string | null> {
  if (requests.length === 0) return null;
  const client = getAnthropic();
  if (!client) return null;
  try {
    if ((await budgetFraction()) >= 1) return null; // budget exhausted
    const apiRequests = requests.map((r) => ({
      custom_id: r.item.customId,
      // Batched drafts: thinking at medium (no refine pass), shared param builder
      // so model/schema/output_config match the synchronous path exactly.
      params: buildMessageParams({ system: DRAFT_SYSTEM, user: buildDraftUserPrompt(r.input), schema: DRAFT_SCHEMA, maxTokens: 1024, think: true, effort: "medium" }),
    }));
    // messages.batches is GA; params shape is built untyped (current API fields).
    const batch = await (client as unknown as { messages: { batches: { create: (b: unknown) => Promise<{ id: string }> } } }).messages.batches.create({ requests: apiRequests } as unknown);
    await recordBatch(batch.id, requests.map((r) => r.item));
    return batch.id;
  } catch {
    return null;
  }
}

interface BatchResultRow {
  custom_id: string;
  result?: { type: string; message?: { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } } };
}

/**
 * Collect a submitted batch. Returns null while still processing; once ended,
 * returns the successfully-parsed drafts (errored/expired entries are dropped).
 * Meters usage so batch spend counts against the budget.
 */
export async function collectBatch(providerBatchId: string): Promise<CollectedDraft[] | null> {
  const client = getAnthropic();
  if (!client) return null;
  const pending = (await listPendingBatches()).find((b) => b.providerBatchId === providerBatchId);
  const itemById = new Map((pending?.items ?? []).map((i) => [i.customId, i]));

  const api = client as unknown as {
    messages: { batches: { retrieve: (id: string) => Promise<{ processing_status: string }>; results: (id: string) => Promise<AsyncIterable<BatchResultRow>> } };
  };
  const meta = await api.messages.batches.retrieve(providerBatchId);
  if (meta.processing_status !== "ended") return null;

  const out: CollectedDraft[] = [];
  const model = aiModel();
  for await (const row of await api.messages.batches.results(providerBatchId)) {
    if (row.result?.type !== "succeeded") continue;
    const msg = row.result.message;
    const usage = msg?.usage;
    if (usage) void recordUsage({ model, inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, costUsd: costOf(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0), feature: "draft.batch" });
    const text = msg?.content?.find((b) => b.type === "text")?.text;
    const item = itemById.get(row.custom_id);
    if (!text || !item) continue;
    try {
      const parsed = JSON.parse(text) as { subject?: string; body: string };
      if (parsed.body) out.push({ item, subject: item.channel === "email" ? parsed.subject : undefined, body: parsed.body });
    } catch {
      /* drop malformed entries */
    }
  }
  return out;
}

// ---- persisted store (dual-mode) ----

async function recordBatch(providerBatchId: string, items: BatchDraftItem[]): Promise<void> {
  try {
    if (!isSupabaseConfigured()) {
      mem.unshift({ id: `b_${Date.now()}_${mem.length}`, providerBatchId, items, status: "pending" });
      return;
    }
    const id = await orgId();
    if (!id) {
      mem.unshift({ id: `b_${Date.now()}_${mem.length}`, providerBatchId, items, status: "pending" });
      return;
    }
    await getSupabase()!.from("ai_batches").insert({ org_id: id, provider_batch_id: providerBatchId, status: "pending", items });
  } catch {
    /* persistence failure shouldn't break submission */
  }
}

export async function listPendingBatches(): Promise<PendingBatch[]> {
  try {
    if (!isSupabaseConfigured()) return mem.filter((b) => b.status === "pending");
    const id = await orgId();
    if (!id) return mem.filter((b) => b.status === "pending");
    const { data } = await getSupabase()!.from("ai_batches").select("*").eq("org_id", id).eq("status", "pending");
    return (data ?? []).map((r) => ({ id: r.id as string, providerBatchId: r.provider_batch_id as string, items: (r.items as BatchDraftItem[]) ?? [], status: r.status as PendingBatch["status"] }));
  } catch {
    return [];
  }
}

export async function markBatchCollected(providerBatchId: string, status: "collected" | "failed" = "collected"): Promise<void> {
  try {
    if (!isSupabaseConfigured()) {
      const b = mem.find((x) => x.providerBatchId === providerBatchId);
      if (b) b.status = status;
      return;
    }
    const id = await orgId();
    if (!id) return;
    await getSupabase()!.from("ai_batches").update({ status, collected_at: new Date().toISOString() }).eq("org_id", id).eq("provider_batch_id", providerBatchId);
  } catch {
    /* best-effort */
  }
}
