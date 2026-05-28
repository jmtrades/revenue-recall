"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NOTIFICATION_OPTIONS, type NotificationPrefs } from "@/lib/notifications";

export function NotificationSettings({ initial, persisted }: { initial: NotificationPrefs; persisted: boolean }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = NOTIFICATION_OPTIONS.some((o) => (prefs[o.key] ?? false) !== (initial[o.key] ?? false));

  function toggle(key: string) {
    if (!persisted) return;
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: prefs }),
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
    <div>
      <ul className="divide-y divide-border">
        {NOTIFICATION_OPTIONS.map((o) => {
          const on = prefs[o.key] ?? false;
          return (
            <li key={o.key} className="flex items-center justify-between py-3">
              <span className="text-sm text-white">{o.label}</span>
              <button
                type="button"
                onClick={() => toggle(o.key)}
                disabled={!persisted}
                aria-pressed={on}
                aria-label={o.label}
                className={`relative h-6 w-11 rounded-full transition disabled:cursor-default disabled:opacity-70 ${on ? "bg-success" : "bg-surface-2"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </li>
          );
        })}
      </ul>

      {persisted ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || status === "saving"}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : "Save preferences"}
          </button>
          {status === "saved" && <span className="text-sm text-success">Saved ✓</span>}
          {status === "error" && <span className="text-sm text-danger">{error}</span>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Connect a database to save notification preferences per organization.</p>
      )}
    </div>
  );
}
