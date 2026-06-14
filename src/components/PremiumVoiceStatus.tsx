"use client";

import { useResource } from "@/lib/useResource";

/** White-labeled status for the in-app premium voice (the hosted neural voice
 *  used for previews / read-aloud / the live in-browser AI voice). Shows whether
 *  it's active without naming the provider. "Standby" = the always-available
 *  built-in browser voice is used instead (no key set, or plan not entitled). */
export function PremiumVoiceStatus() {
  const { data, loading } = useResource<{ available: boolean }>(
    "/api/voice/tts",
    (j) => j as { available: boolean },
  );

  const active = Boolean(data?.available);
  const label = loading
    ? "Checking premium voice…"
    : active
      ? "Premium voice — active"
      : "Premium voice — standby (using the built-in voice)";

  return (
    <div className="mb-3 flex items-center gap-2 text-sm text-muted">
      <span className={`inline-block h-2 w-2 rounded-full ${loading ? "bg-border" : active ? "bg-success" : "bg-muted/50"}`} />
      <span className={active ? "text-fg" : undefined}>{label}</span>
    </div>
  );
}
