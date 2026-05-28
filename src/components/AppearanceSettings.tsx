"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ACCENTS, type AccentKey, type ThemeMode } from "@/lib/theme";

const MODES: { value: ThemeMode; label: string; hint: string }[] = [
  { value: "dark", label: "Dark", hint: "Always dark" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "system", label: "System", hint: "Match your OS" },
];

/** Per-org appearance: accent color + light/dark/system mode. Saving re-themes the app. */
export function AppearanceSettings({
  initialAccent,
  initialMode,
  persisted,
}: {
  initialAccent: AccentKey;
  initialMode: ThemeMode;
  persisted: boolean;
}) {
  const router = useRouter();
  const [accent, setAccent] = useState<AccentKey>(initialAccent);
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(theme: { accent?: AccentKey; mode?: ThemeMode }, rollback: () => void) {
    if (!persisted) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      router.refresh();
    } catch (e) {
      rollback();
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  function chooseAccent(next: AccentKey) {
    if (next === accent || !persisted) return;
    const prev = accent;
    setAccent(next);
    void save({ accent: next }, () => setAccent(prev));
  }

  function chooseMode(next: ThemeMode) {
    if (next === mode || !persisted) return;
    const prev = mode;
    setMode(next);
    void save({ mode: next }, () => setMode(prev));
  }

  const keys = Object.keys(ACCENTS) as AccentKey[];

  return (
    <div className="space-y-6">
      {/* Mode */}
      <div>
        <p className="text-sm font-medium text-fg">Appearance</p>
        <p className="mt-0.5 text-xs text-muted">Choose light, dark, or follow your operating system.</p>
        <div className="mt-3 inline-flex rounded-lg border border-border bg-surface-2 p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => chooseMode(m.value)}
              disabled={!persisted || busy}
              aria-pressed={mode === m.value}
              title={m.hint}
              className={`rounded-md px-3 py-1.5 text-sm transition disabled:opacity-60 ${
                mode === m.value ? "bg-brand text-white" : "text-muted hover:text-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div>
        <p className="text-sm font-medium text-fg">Accent color</p>
        <p className="mt-0.5 text-xs text-muted">Themes the navigation, buttons, links, badges, and highlights across your workspace.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {keys.map((key) => {
            const a = ACCENTS[key];
            const selected = key === accent;
            return (
              <button
                key={key}
                type="button"
                onClick={() => chooseAccent(key)}
                disabled={!persisted || busy}
                aria-pressed={selected}
                title={a.label}
                className={`flex w-[88px] flex-col items-center gap-2 rounded-xl border p-3 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected ? "border-fg/40 bg-surface-2" : "border-border hover:border-fg/20 hover:bg-surface-2"
                }`}
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full ring-2 transition ${selected ? "ring-fg/70" : "ring-transparent"}`}
                  style={{ background: a.hex } as CSSProperties}
                >
                  {selected && <span className="text-sm font-bold text-white drop-shadow">✓</span>}
                </span>
                <span className="text-xs text-muted">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!persisted && <p className="text-xs text-muted">Connect a database to save appearance settings.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
