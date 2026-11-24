import { toCsv } from "@/lib/csv";
import type { Attribution } from "@/lib/roi/model";
import type { RoiEvent } from "@/lib/roi/types";

/** Ledger export. Attribution columns are filled when this event is an outcome. */
export function roiToCsv(events: RoiEvent[], attributions: Attribution[]): string {
  const byOutcome = new Map(attributions.map((a) => [a.outcomeId, a]));
  const header = [
    "occurred_at",
    "event",
    "channel",
    "actor",
    "contact_id",
    "deal_id",
    "lead_id",
    "campaign_id",
    "sequence_id",
    "revenue",
    "cost",
    "attributed_channel",
    "attributed_campaign",
    "attributed_touch",
  ];
  const rows = [...events]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .map((e) => {
      const a = byOutcome.get(e.id);
      return [
        e.occurredAt,
        e.name,
        e.channel ?? "",
        e.actor ?? "",
        e.contactId ?? "",
        e.dealId ?? "",
        e.leadId ?? "",
        e.campaignId ?? "",
        e.sequenceId ?? "",
        e.revenue ?? "",
        e.cost ?? "",
        a?.channel ?? "",
        a?.campaignId ?? "",
        a?.touchName ?? "",
      ];
    });
  return toCsv([header, ...rows]);
}
