"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { LANGUAGES } from "@/lib/languages";

// Full IANA zone list where the runtime supports it; a common-business fallback
// otherwise. Computed once.
const TIMEZONES: string[] = (() => {
  try {
    const v = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (v && v.length) return v;
  } catch {
    /* fall through */
  }
  return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];
})();

export function OrgSettingsForm({
  initialName,
  initialQuota,
  initialLanguage,
  initialTimezone,
  initialSenderName,
  initialAddress,
  persisted,
}: {
  initialName: string;
  initialQuota: number;
  initialLanguage: string;
  initialTimezone: string;
  initialSenderName: string;
  initialAddress: string;
  persisted: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [quota, setQuota] = useState(String(initialQuota));
  const [language, setLanguage] = useState(initialLanguage);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [senderName, setSenderName] = useState(initialSenderName);
  const [address, setAddress] = useState(initialAddress);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== initialName || Number(quota) !== initialQuota || language !== initialLanguage || timezone !== initialTimezone || senderName !== initialSenderName || address !== initialAddress;
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-60";
  const touched = () => setStatus("idle");

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, language, timezone, monthlyQuota: Number(quota) || 0, compliance: { senderName, address } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="stat-label">Organization name</label>
        <input className={`${input} mt-1`} value={name} disabled={!persisted} onChange={(e) => { setName(e.target.value); touched(); }} />
      </div>
      <div>
        <label className="stat-label">Monthly revenue goal</label>
        <input className={`${input} mt-1`} type="number" min={0} value={quota} disabled={!persisted} onChange={(e) => { setQuota(e.target.value); touched(); }} />
      </div>
      <div>
        <label className="stat-label">Language you sell in</label>
        <select className={`${input} mt-1`} value={language} disabled={!persisted} onChange={(e) => { setLanguage(e.target.value); touched(); }}>
          <optgroup label="Email, texts + live voice calls">
            {LANGUAGES.filter((l) => l.voiceCall).map((l) => (
              <option key={l.code} value={l.code}>{l.label} — {l.native}</option>
            ))}
          </optgroup>
          <optgroup label="Email + texts (live calls coming)">
            {LANGUAGES.filter((l) => !l.voiceCall).map((l) => (
              <option key={l.code} value={l.code}>{l.label} — {l.native}</option>
            ))}
          </optgroup>
        </select>
        <p className="mt-1 text-xs text-muted">AI writes every email, text, and call script in this language — and speaks it on live calls where supported.</p>
      </div>
      <div>
        <label className="stat-label">Timezone</label>
        <select className={`${input} mt-1`} value={timezone} disabled={!persisted} onChange={(e) => { setTimezone(e.target.value); touched(); }}>
          <option value="">UTC (default)</option>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Your daily digest goes out in this timezone&apos;s morning.</p>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium text-fg">Sending identity (compliance)</p>
        <p className="mt-0.5 text-xs text-muted">Appears in the unsubscribe footer of every outbound email. A real postal address is legally required (CAN-SPAM).</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="stat-label">Sender name</label>
            <input className={`${input} mt-1`} aria-label="Sender name" value={senderName} disabled={!persisted} placeholder={name} onChange={(e) => { setSenderName(e.target.value); touched(); }} />
          </div>
          <div>
            <label className="stat-label">Postal address</label>
            <input className={`${input} mt-1`} aria-label="Postal address" value={address} disabled={!persisted} placeholder="123 Main St, Springfield, IL 62701" onChange={(e) => { setAddress(e.target.value); touched(); }} />
          </div>
        </div>
      </div>

      {persisted ? (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || status === "saving"} className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50">
            {status === "saving" ? "Saving…" : "Save changes"}
          </button>
          {status === "saved" && <span className="inline-flex items-center gap-1 text-sm text-success"><Icon name="approvals" size={13} /> Saved</span>}
          {status === "error" && <span className="text-sm text-danger">{error}</span>}
        </div>
      ) : (
        <p className="text-xs text-muted">Connect a database to edit these. Without one, values come from environment variables.</p>
      )}
    </div>
  );
}
