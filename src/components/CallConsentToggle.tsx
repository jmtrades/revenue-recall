"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Record or withdraw express consent to place autonomous AI calls to this
 * contact. This is the gate the autopilot and call-retries check before any
 * auto-dial (TCPA / FCC 2024) — without it on file, the AI hands the contact to
 * a human to dial instead of calling them automatically.
 */
export function CallConsentToggle({
  contactId,
  initialConsent,
  canWrite,
}: {
  contactId: string;
  initialConsent: boolean;
  canWrite: boolean;
}) {
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId, consent: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update consent");
      setConsent(Boolean(data.consent));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update consent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`pill inline-flex items-center gap-1.5 ${consent ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}
        >
          <Icon name={consent ? "approvals" : "dialer"} size={13} />
          {consent ? "Consent on file" : "No consent on file"}
        </span>
        {canWrite && (
          <button
            onClick={() => toggle(!consent)}
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              consent
                ? "border border-border text-muted hover:text-fg"
                : "bg-brand-strong text-white hover:bg-brand-strong/90"
            }`}
          >
            {busy ? "Saving…" : consent ? "Withdraw consent" : "Record consent"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {consent
          ? "The AI may call and text this contact autonomously. Withdraw anytime — autonomous calling and texting stop immediately."
          : "The AI won't auto-call or auto-text without consent on file — those are handed to a person instead. Record consent only when this contact has agreed to be contacted by call and text."}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
