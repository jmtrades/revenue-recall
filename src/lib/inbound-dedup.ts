import { getSupabase } from "@/lib/supabase/client";

/**
 * Inbound-webhook idempotency. Twilio and email providers deliver at-least-once
 * and retry on any timeout / non-2xx, so without dedup a single inbound message
 * gets logged twice and (under autopilot) triggers a SECOND auto-reply to the
 * prospect. We record each provider event id exactly once.
 *
 * Returns true when the event was ALREADY processed (the caller should no-op).
 * When it's newly seen — or there's no DB, or a non-uniqueness error — it returns
 * false so a real inbound is never dropped (fail open: a rare double beats
 * silently losing a customer's reply).
 */
export async function seenInboundEvent(provider: string, eventId: string): Promise<boolean> {
  const client = getSupabase();
  if (!client || !eventId) return false;
  const { error } = await client.from("inbound_events").insert({ provider, event_id: eventId });
  if (!error) return false; // newly recorded → process it
  return (error as { code?: string }).code === "23505"; // unique violation → duplicate
}
