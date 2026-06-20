"use client";

import { useEffect, useRef, useState } from "react";
import { SignalWave } from "@/components/RecallOrbit";
import { DEMO_LINES } from "@/lib/voice/demo-lines";

type Status = "idle" | "loading" | "speaking";

// Which demo line leads on a per-industry lander — the scenario closest to how
// that vertical actually sells (Aria=listing recall, Adam=rate callback,
// Nova=quote-expiry save, George=gracious project win-back).
const INDUSTRY_LINE: Record<string, number> = {
  real_estate: 0,
  mortgage: 1,
  insurance: 2,
  auto: 2,
  agency: 3,
  saas: 3,
  home_services: 3,
};

/**
 * Landing "hear it" demo. Plays a real sales line in the SAME ElevenLabs voice the
 * product uses on calls — synthesized server-side via /api/voice/preview (the key
 * never touches the browser) from a fixed, cached set of lines. Honest fallback:
 * if ElevenLabs isn't configured the route returns 503 and we say the preview is
 * offline rather than play a different, lesser voice (voice is ElevenLabs-only).
 */
export function VoiceDemo({ industryId }: { industryId?: string }) {
  const [active, setActive] = useState(industryId ? INDUSTRY_LINE[industryId] ?? 0 : 0);
  const [status, setStatus] = useState<Status>("idle");
  const [unavailable, setUnavailable] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  function cleanup() {
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch { /* gone */ }
      urlRef.current = null;
    }
  }
  function stop() {
    try { audioRef.current?.pause(); } catch { /* already stopped */ }
    audioRef.current = null;
    cleanup();
    setStatus("idle");
  }

  // Unmount cleanup — inlined (not via stop()) so it needs no deps and never
  // setState after unmount.
  useEffect(() => {
    return () => {
      try { audioRef.current?.pause(); } catch { /* noop */ }
      if (urlRef.current) {
        try { URL.revokeObjectURL(urlRef.current); } catch { /* noop */ }
      }
    };
  }, []);

  async function play(i: number) {
    // Clicking the playing card stops it; clicking another switches to it.
    if (status === "speaking" && i === active) return stop();
    try { audioRef.current?.pause(); } catch { /* noop */ }
    cleanup();
    setActive(i);
    setUnavailable(false);
    setStatus("loading");
    try {
      const res = await fetch(`/api/voice/preview?line=${i}`);
      if (!res.ok) {
        setUnavailable(true);
        setStatus("idle");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;
      const end = () => {
        if (audioRef.current === audio) {
          cleanup();
          audioRef.current = null;
          setStatus("idle");
        }
      };
      audio.onended = end;
      audio.onerror = end;
      setStatus("speaking");
      await audio.play().catch(() => end());
    } catch {
      setUnavailable(true);
      setStatus("idle");
    }
  }

  const line = DEMO_LINES[active];

  return (
    <div className="bezel relative overflow-hidden rounded-[1.5rem] p-2">
      <div className="rounded-[1rem] border border-border bg-surface p-5 sm:p-7">
        {/* header */}
        <div className="flex items-center justify-between">
          <span className="eyebrow">Hear it</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            The voice it calls in
          </span>
        </div>

        {/* the line, as a call bubble */}
        <div className="mt-5 flex gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand-strong text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.35)]">
            {line.name[0]}
          </span>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border bg-surface-2/60 px-4 py-3">
            <p className="text-[15px] leading-relaxed text-body">{line.text}</p>
            {status === "speaking" && (
              <div className="mt-2.5 flex items-center gap-2 text-[11px] font-medium text-brand">
                <SignalWave bars={9} height={15} />
                <span>Speaking live</span>
              </div>
            )}
          </div>
        </div>

        {/* controls */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {DEMO_LINES.map((l, i) => {
            const isActive = i === active;
            const isPlaying = status === "speaking" && isActive;
            return (
              <button
                key={l.voiceId}
                onClick={() => play(i)}
                aria-pressed={isActive}
                className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "border-brand/50 bg-brand-soft/30 text-fg" : "border-border text-muted hover:text-fg"
                }`}
              >
                {/* play / stop / equalizer per state */}
                <span className="grid h-5 w-5 place-items-center text-brand">
                  {isPlaying ? (
                    <span className="flex items-end gap-[2px]" aria-hidden>
                      <span className="w-[3px] animate-[rr-eq_0.9s_ease-in-out_infinite] rounded-full bg-brand" style={{ height: 7 }} />
                      <span className="w-[3px] animate-[rr-eq_0.9s_ease-in-out_0.15s_infinite] rounded-full bg-brand" style={{ height: 13 }} />
                      <span className="w-[3px] animate-[rr-eq_0.9s_ease-in-out_0.3s_infinite] rounded-full bg-brand" style={{ height: 9 }} />
                    </span>
                  ) : status === "loading" && isActive ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  )}
                </span>
                <span className="flex flex-col items-start leading-none">
                  <span>{l.name}</span>
                  <span className="mt-0.5 text-[10px] font-normal text-muted">{l.tone}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* status line */}
        <p className="mt-4 h-4 text-xs text-muted" aria-live="polite">
          {status === "loading"
            ? "Generating the preview…"
            : status === "speaking"
              ? "Speaking — this is the exact voice it uses on calls."
              : unavailable
                ? "Voice preview is offline right now — it's live in the app."
                : "Tap a voice to hear a real call line in its actual voice."}
        </p>
      </div>
    </div>
  );
}
