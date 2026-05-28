"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ACCENTS, type AccentKey } from "@/lib/theme";

/** Per-org accent picker. Saving re-themes the whole app chrome on refresh. */
export function AppearanceSettings({ initialAccent, persisted }: { initialAccent: AccentKey; persisted: boolean }) {
  const router = useRouter();
  const [accent, setAccent] = useState<AccentKey>(initialAccent);
  const [saving, setSaving] = useState<AccentKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: AccentKey) {
    if (next === accent || !persisted) return;
    const previous = accent;
    setAccent(next);
    setSaving(next);
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: { accent: next } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      router.refresh();
    } catch (e) {
      setAccent(previous);
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(null);
    }
  }

  const keys = Object.keys(ACCENTS) as AccentKey[];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-white">Accent color</p>
        <p className="mt-0.5 text-xs text-muted">Themes the navigation, buttons, links, badges, and highlights across your workspace.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {keys.map((key) => {
          const a = ACCENTS[key];
          const selected = key === accent;
          return (
            <button
              key={key}
              type="button"
              onClick={() => choose(key)}
              disabled={!persisted || saving !== null}
              aria-pressed={selected}
              title={a.label}
              className={`flex w-[88px] flex-col items-center gap-2 rounded-xl border p-3 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? "border-white/40 bg-surface-2" : "border-border hover:border-white/20 hover:bg-surface-2"
              }`}
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-full ring-2 transition ${selected ? "ring-white/70" : "ring-transparent"}`}
                style={{ background: a.hex } as CSSProperties}
              >
                {selected && <span className="text-sm font-bold text-white drop-shadow">✓</span>}
              </span>
              <span className="text-xs text-muted">{a.label}</span>
            </button>
          );
        })}
      </div>

      {!persisted && <p className="text-xs text-muted">Connect a database to save appearance settings.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
