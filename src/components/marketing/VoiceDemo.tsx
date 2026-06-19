"use client";

import { useEffect, useRef, useState } from "react";
import { ensureLocalVoice, localSynth, localVoiceProgress } from "@/lib/voice/local";
import { browserSynth } from "@/lib/voice/synth";
import { SignalWave } from "@/components/RecallOrbit";
import type { SpeakHandle } from "@/lib/voice/speech";
import type { Emotion } from "@/lib/voice/speech";

// Real outbound lines — what the AI would actually say working a slipping deal.
// Each is paired with the voice + delivery that fits it, so a click sounds like
// a person on a call, not a TTS demo reading a paragraph.
const LINES: { voiceId: string; name: string; tone: string; emotion: Emotion; text: string }[] = [
  {
    voiceId: "af_heart",
    name: "Aria",
    tone: "Warm · US",
    emotion: "warm",
    text: "Hey Jordan, it's Aria over at Northwind. That corner unit you'd looked at in the spring just came back on — and at a better number this time. Worth a quick look this weekend?",
  },
  {
    voiceId: "am_adam",
    name: "Adam",
    tone: "Steady · US",
    emotion: "confident",
    text: "Hi Sam, Adam here. I know rates were the holdup last time we spoke. They've moved since then, so I re-ran your numbers — I think you'll like where it lands. Have two minutes?",
  },
  {
    voiceId: "af_nova",
    name: "Nova",
    tone: "Confident · US",
    emotion: "energetic",
    text: "Morning! It's Nova following up on your quote. It expires Friday, but I can lock today's pricing for you right now if you're still interested. Want me to hold it?",
  },
  {
    voiceId: "bm_george",
    name: "George",
    tone: "British · UK",
    emotion: "calm",
    text: "Hello, it's George. We never did close the loop on your project — completely my fault for letting it go quiet. If the timing's better now, I'd love to pick it back up.",
  },
];

type Status = "idle" | "warming" | "speaking";

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
 * Landing "hear it" demo. Synthesizes a real sales line with the SAME on-device
 * neural voice the product uses — live, in the visitor's browser, free, no
 * signup. First click loads the model (with a friendly progress beat); after
 * that every line is instant. Honest fallback: if the device can't run it, we
 * say so rather than play a worse voice and pretend.
 */
export function VoiceDemo({ industryId }: { industryId?: string }) {
  const [active, setActive] = useState(industryId ? INDUSTRY_LINE[industryId] ?? 0 : 0);
  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      handleRef.current?.stop();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stop() {
    handleRef.current?.stop();
    handleRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("idle");
  }

  async function play(i: number) {
    // Clicking the playing card stops it; clicking another switches to it.
    if (status === "speaking" && i === active) return stop();
    handleRef.current?.stop();
    setActive(i);

    setStatus("warming");
    const ok = await ensureLocalVoice();
    // Track download progress until ready.
    if (!ok) {
      // Couldn't run the neural model here — be honest, don't fake it with the
      // robotic browser voice. (Most modern browsers DO run it.)
      setUnsupported(true);
      setStatus("idle");
      return;
    }
    if (pollRef.current) clearInterval(pollRef.current);

    setStatus("speaking");
    const line = LINES[i];
    const synth = localSynth.available() ? localSynth : browserSynth;
    const handle = await synth.speak(line.text, { voiceId: line.voiceId, emotion: line.emotion });
    handleRef.current = handle;
    handle.done.then(() => {
      if (handleRef.current === handle) {
        handleRef.current = null;
        setStatus("idle");
      }
    });
  }

  // While warming, surface the model download as a friendly percentage.
  useEffect(() => {
    if (status !== "warming") return;
    pollRef.current = setInterval(() => setPct(Math.round(localVoiceProgress() * 100)), 120);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status]);

  const line = LINES[active];

  return (
    <div className="bezel relative overflow-hidden rounded-[1.5rem] p-2">
      <div className="rounded-[1rem] border border-border bg-surface p-5 sm:p-7">
        {/* header */}
        <div className="flex items-center justify-between">
          <span className="eyebrow">Hear it</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Runs free, on your device
          </span>
        </div>

        {/* the line, as a call bubble */}
        <div className="mt-5 flex gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.35)]">
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
          {LINES.map((l, i) => {
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
                  ) : status === "warming" && isActive ? (
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
          {status === "warming"
            ? `Warming up the voice… ${pct > 0 ? `${pct}%` : ""} (≈90 MB once, then it's instant)`
            : status === "speaking"
              ? "Speaking — this is the exact voice it uses on calls."
              : unsupported
                ? "Your browser can't preview the voice here — it runs in the app on Chrome, Edge, and Safari."
                : "Tap a voice. The audio is generated live on your device — nothing uploaded."}
        </p>
      </div>
    </div>
  );
}
