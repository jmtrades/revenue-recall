"use client";

import { useState } from "react";
import { useResource } from "@/lib/useResource";

interface ElevenVoice {
  id: string;
  name: string;
  category: string;
  labels?: Record<string, string>;
  previewUrl?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  premade: "Library",
  cloned: "Your clone",
  professional: "Pro clone",
  generated: "Generated",
};

/** Browse the voices in your ElevenLabs account — premade library voices and
 *  your own clones — with a preview and a copy-able id to drop into
 *  ELEVENLABS_VOICE_MAP. Owner/admin only (the route 403s otherwise → this shows
 *  nothing), and it renders nothing when ElevenLabs isn't configured. */
export function ElevenLabsVoices() {
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading } = useResource<{ configured: boolean; voices: ElevenVoice[] }>(
    "/api/voice/elevenlabs/voices",
    (j) => j as { configured: boolean; voices: ElevenVoice[] },
    {
      onStatus: (s) => {
        if (s === 403 || s === 401) {
          setHidden(true);
          return true;
        }
        return false;
      },
    },
  );

  // Hidden for non-owners, and absent entirely when ElevenLabs isn't set up —
  // keeps the panel out of the way for orgs not using it.
  if (hidden) return null;
  if (!loading && data && !data.configured) return null;

  const voices = data?.voices ?? [];

  function copy(id: string) {
    navigator.clipboard?.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  return (
    <div className="card mt-4">
      <h2 className="font-semibold text-fg">ElevenLabs voices</h2>
      <p className="mt-1 text-sm text-muted">
        The voices in your ElevenLabs account — library voices and your own clones. Copy an id into{" "}
        <span className="font-mono text-xs">ELEVENLABS_VOICE_MAP</span> to map it to a house voice.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading voices…</p>
      ) : voices.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No voices found on this account.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {voices.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <span className="text-sm text-fg">{v.name}</span>
                <span className="ml-2 pill bg-surface-2 text-[10px] text-muted">{CATEGORY_LABEL[v.category] ?? v.category}</span>
                {v.labels && (v.labels.gender || v.labels.accent) && (
                  <span className="ml-2 text-xs text-muted">{[v.labels.gender, v.labels.accent].filter(Boolean).join(" · ")}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {v.previewUrl && <audio controls preload="none" src={v.previewUrl} className="h-8" aria-label={`Preview ${v.name}`} />}
                <button
                  onClick={() => copy(v.id)}
                  aria-live="polite"
                  title="Copy voice id"
                  className="rounded-lg border border-border px-2 py-1 font-mono text-[11px] text-muted transition hover:text-fg"
                >
                  {copied === v.id ? "Copied" : v.id}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
