"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { VoiceDisabledNotice } from "@/components/VoiceDisabledNotice";

/**
 * ElevenLabs voice library for the hosted read-aloud voice: pick from the whole
 * account catalogue (premade + professional + the org's own clones), preview any
 * of them, and clone your own voice from a short recording or upload. Self-hides
 * unless ElevenLabs is configured and the plan is entitled (GET reports it), so
 * it never shows a dead surface. Selecting here sets the org's `tts_voice_id`,
 * which every read-aloud / preview surface then speaks in.
 */

interface Voice {
  id: string;
  name: string;
  category: string;
  description: string;
  previewUrl?: string;
  cloned: boolean;
}

const PREVIEW_LINE =
  "Hi, it's me — I know it's been a minute, but I've got something worth thirty seconds. Is now an okay time?";

export function VoiceLibrary() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>("ok");
  const [canFix, setCanFix] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ rate: number; expressiveness: number }>({ rate: 1, expressiveness: 0.5 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/library");
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setReason(typeof data.reason === "string" ? data.reason : "ok");
      setCanFix(Boolean(data.canFix));
      setVoices(Array.isArray(data.voices) ? data.voices : []);
      setSelected(data.selected ?? null);
      if (data.settings && typeof data.settings === "object") {
        setSettings({
          rate: Number(data.settings.rate) || 1,
          expressiveness: typeof data.settings.expressiveness === "number" ? data.settings.expressiveness : 0.5,
        });
      }
      if (data.error) setError(data.error);
    } catch {
      setConfigured(false);
    }
  }, []);

  // Debounced persist of the speed/expressiveness sliders (so dragging doesn't
  // fire a request per pixel).
  const saveSettings = useCallback((next: { rate: number; expressiveness: number }) => {
    setSettings(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/voice/hosted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: next.rate, expressiveness: next.expressiveness }),
      }).catch(() => {});
    }, 500);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      audioRef.current?.pause();
    };
  }, [load]);

  const sel = useCallback((id: string) => `eleven:${id}`, []);

  async function choose(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/voice/hosted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: sel(id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSelected(data.voiceId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  // Play a URL through a fresh <audio>, applying the tuned speed only AFTER the
  // media loads (setting playbackRate before load throws "operation not supported"
  // in some browsers). Rejects if the source can't be decoded/played so the caller
  // can fall back.
  const playUrl = useCallback((vid: string, url: string, revoke: boolean) => {
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio();
      audioRef.current = audio;
      const cleanup = () => { if (revoke) { try { URL.revokeObjectURL(url); } catch { /* gone */ } } };
      audio.onloadedmetadata = () => { try { audio.playbackRate = Math.min(1.5, Math.max(0.5, settings.rate)); } catch { /* range */ } };
      audio.onended = () => { setPreviewing((p) => (p === vid ? null : p)); cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("audio error")); };
      audio.src = url;
      audio.play().then(resolve, (err) => { cleanup(); reject(err); });
    });
  }, [settings.rate]);

  const synthVoice = useCallback(async (vid: string) => {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: PREVIEW_LINE, voiceId: sel(vid), emotion: "warm", quality: "max", rate: settings.rate, expressiveness: settings.expressiveness }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      throw new Error(b?.error ?? "The voice service rejected the preview.");
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error("The voice service returned no audio.");
    await playUrl(vid, URL.createObjectURL(blob), true);
  }, [settings.rate, settings.expressiveness, sel, playUrl]);

  async function preview(v: Voice) {
    audioRef.current?.pause();
    if (previewing === v.id) {
      setPreviewing(null);
      return;
    }
    setPreviewing(v.id);
    setError(null);
    try {
      // The provider's own sample is instant + free when present. If it can't play
      // (cross-origin/format quirks — the "operation is not supported" case) OR
      // there's no sample, synthesize this exact voice via ElevenLabs so you always
      // hear it, in the tuned voice.
      if (v.previewUrl) {
        try {
          await playUrl(v.id, v.previewUrl, false);
          return;
        } catch {
          /* provider sample wouldn't play — fall through to synthesizing it */
        }
      }
      await synthVoice(v.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't play this voice — try again.");
      setPreviewing(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this cloned voice? This can't be undone.")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/voice/clone?voiceId=${encodeURIComponent(sel(id))}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      if (selected === sel(id)) setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  if (configured === null) return null; // still loading

  // Not connected: tell the owner exactly why + how to fix (reps see nothing).
  if (configured === false) {
    if (!canFix) return null;
    const msg =
      reason === "not_entitled"
        ? "Live AI voice is on paid plans — connect billing, or set BILLING_ENFORCE=false to use it now."
        : reason === "error"
          ? `The premium voice service key is set but the connection was rejected${error ? `: ${error}` : ""}. Double-check ELEVENLABS_API_KEY in Vercel is a valid key, then redeploy.`
          : "The premium voice service isn't connected. Add ELEVENLABS_API_KEY in Vercel (and ELEVENLABS_AGENT_ID for the live agent), then redeploy.";
    return (
      <div className="mt-5 space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium text-fg">Read-aloud voice</p>
        <VoiceDisabledNotice
          title="Voice not connected"
          message={msg}
          link={{ href: "https://elevenlabs.io/app/settings/api-keys", label: "Get a voice API key →" }}
        />
      </div>
    );
  }

  const clones = voices.filter((v) => v.cloned);
  const stock = voices.filter((v) => !v.cloned);

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium text-fg">Read-aloud voice</p>
        <p className="text-xs text-muted">
          The voice the app speaks in for read-alouds and previews. Pick from the catalogue below, or clone your own — tap ▶ to hear each one.
        </p>
      </div>

      {/* Voice tuning — speaking speed + expressiveness, applied to every
          read-aloud. Persisted (debounced); preview the effect with ▶ above. */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2/40 p-3 sm:grid-cols-2">
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-fg">
            Speaking speed <span className="text-muted">{settings.rate.toFixed(2)}×</span>
          </span>
          <input
            type="range" min={0.7} max={1.2} step={0.05} value={settings.rate}
            onChange={(e) => saveSettings({ ...settings, rate: Number(e.target.value) })}
            className="mt-1.5 w-full accent-[var(--brand,#6366f1)]"
            aria-label="Speaking speed"
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-fg">
            Expressiveness <span className="text-muted">{Math.round(settings.expressiveness * 100)}%</span>
          </span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.expressiveness}
            onChange={(e) => saveSettings({ ...settings, expressiveness: Number(e.target.value) })}
            className="mt-1.5 w-full accent-[var(--brand,#6366f1)]"
            aria-label="Expressiveness"
          />
        </label>
      </div>

      <CloneVoice onCloned={load} />

      <BrowseLibrary onAdded={load} defaultOpen={stock.length < 8} />

      {clones.length > 0 && (
        <VoiceSection
          title="Your cloned voices"
          voices={clones}
          selected={selected}
          busy={busy}
          previewing={previewing}
          onChoose={choose}
          onPreview={preview}
          onRemove={remove}
          sel={sel}
        />
      )}
      <VoiceSection
        title="Voice library"
        voices={stock}
        selected={selected}
        busy={busy}
        previewing={previewing}
        onChoose={choose}
        onPreview={preview}
        sel={sel}
      />

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function VoiceSection({
  title,
  voices,
  selected,
  busy,
  previewing,
  onChoose,
  onPreview,
  onRemove,
  sel,
}: {
  title: string;
  voices: Voice[];
  selected: string | null;
  busy: string | null;
  previewing: string | null;
  onChoose: (id: string) => void;
  onPreview: (v: Voice) => void;
  onRemove?: (id: string) => void;
  sel: (id: string) => string;
}) {
  if (!voices.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted/70">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {voices.map((v) => {
          const active = selected === sel(v.id);
          const isPreviewing = previewing === v.id;
          return (
            <div
              key={v.id}
              className={`flex items-stretch gap-1 rounded-lg border transition ${active ? "border-brand bg-brand-soft/30" : "border-border hover:border-brand/40"}`}
            >
              <button
                onClick={() => onChoose(v.id)}
                disabled={busy !== null}
                className="min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                  <span className="truncate">{v.name}</span>
                  {active && <span className="pill bg-brand/15 text-brand text-[10px]">In use</span>}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted">
                  {busy === v.id ? "Saving…" : v.description}
                </span>
              </button>
              {onRemove && (
                <button
                  onClick={() => onRemove(v.id)}
                  disabled={busy !== null}
                  aria-label={`Delete ${v.name}`}
                  className="grid w-8 flex-none place-items-center border-l border-border text-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  <Icon name="close" size={13} />
                </button>
              )}
              <button
                onClick={() => onPreview(v)}
                aria-label={isPreviewing ? `Stop ${v.name} preview` : `Preview ${v.name}`}
                className={`grid w-9 flex-none place-items-center rounded-r-lg border-l text-brand transition-colors ${active ? "border-brand/30" : "border-border"} hover:bg-brand-soft/40`}
              >
                {isPreviewing ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SharedVoice {
  id: string;
  publicOwnerId: string;
  name: string;
  description: string;
  category: string;
  previewUrl?: string;
  usage: number;
}

/**
 * Browse and add from the FULL public ElevenLabs library (thousands of voices),
 * not just the account catalogue. Search, preview the provider's sample, and
 * "Add to my voices" — which copies it into the account so it appears above and
 * becomes selectable. Voices added this session are marked done; we intentionally
 * don't dedupe against owned voices by name (common names like "Adam"/"Aria"
 * collide across distinct voices, which would wrongly block a wanted add).
 */
function BrowseLibrary({ onAdded, defaultOpen = false }: { onAdded: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [voices, setVoices] = useState<SharedVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // One-shot guard for the initial auto-load, so a search that legitimately
  // returns zero results doesn't re-trigger the default-list fetch (which would
  // snap the empty state back to the full catalogue).
  const autoLoaded = useRef(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = q.trim() ? `/api/voice/shared?search=${encodeURIComponent(q.trim())}` : "/api/voice/shared";
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) setError(data.error);
      setVoices(Array.isArray(data.voices) ? data.voices : []);
    } catch {
      setError("Couldn't load the library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !autoLoaded.current) {
      autoLoaded.current = true;
      void search("");
    }
    return () => {
      audioRef.current?.pause();
    };
  }, [open, search]);

  async function preview(v: SharedVoice) {
    audioRef.current?.pause();
    if (previewing === v.id) return setPreviewing(null);
    if (!v.previewUrl) return;
    setPreviewing(v.id);
    const audio = new Audio(v.previewUrl);
    audioRef.current = audio;
    audio.onended = () => setPreviewing((p) => (p === v.id ? null : p));
    try {
      await audio.play();
    } catch {
      setPreviewing(null);
    }
  }

  async function add(v: SharedVoice) {
    setBusy(v.id);
    setError(null);
    try {
      const res = await fetch("/api/voice/shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicOwnerId: v.publicOwnerId, voiceId: v.id, name: v.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't add voice");
      setAdded((prev) => new Set(prev).add(v.id));
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add voice");
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg transition hover:border-brand/40"
      >
        <Icon name="search" size={13} className="text-brand" /> Browse the full voice library
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Browse all voices</p>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg">Close</button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Thousands of professional voices. Search, preview with ▶, then add the ones you want — they&apos;ll appear in your library above, ready to use.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); void search(query); }}
        className="mt-2 flex gap-2"
      >
        <input
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
          placeholder="Search by name, accent, style… (e.g. warm British female)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={80}
        />
        <button type="submit" disabled={loading} className="flex-none rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {loading ? "…" : "Search"}
        </button>
      </form>

      <div className="mt-3 grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {voices.map((v) => {
          const isAdded = added.has(v.id);
          const isPreviewing = previewing === v.id;
          return (
            <div key={`${v.publicOwnerId}:${v.id}`} className="flex items-stretch gap-1 rounded-lg border border-border">
              <div className="min-w-0 flex-1 px-3 py-2">
                <span className="block truncate text-sm font-medium text-fg">{v.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted">{v.description}</span>
              </div>
              {v.previewUrl && (
                <button
                  onClick={() => preview(v)}
                  aria-label={isPreviewing ? `Stop ${v.name} preview` : `Preview ${v.name}`}
                  className="grid w-9 flex-none place-items-center border-l border-border text-brand transition-colors hover:bg-brand-soft/40"
                >
                  {isPreviewing ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
              )}
              <button
                onClick={() => add(v)}
                disabled={isAdded || busy === v.id}
                aria-label={`Add ${v.name} to my voices`}
                className="grid w-9 flex-none place-items-center rounded-r-lg border-l border-border text-brand transition-colors hover:bg-brand-soft/40 disabled:opacity-40"
              >
                {busy === v.id ? (
                  <span className="text-[10px] text-muted">…</span>
                ) : isAdded ? (
                  <Icon name="check" size={14} className="text-success" />
                ) : (
                  <Icon name="plus" size={14} />
                )}
              </button>
            </div>
          );
        })}
        {!loading && voices.length === 0 && (
          <p className="col-span-full py-4 text-center text-xs text-muted">No voices found — try a different search.</p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function CloneVoice({ onCloned }: { onCloned: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        setRecorded(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setFile(null);
    } catch {
      setError("Couldn't access the microphone.");
    }
  }

  async function submit() {
    const sample = recorded
      ? new File([recorded], "recording.webm", { type: recorded.type || "audio/webm" })
      : file;
    if (!name.trim()) return setError("Give your voice a name.");
    if (!sample) return setError("Record or upload an audio sample.");
    setBusy(true); setError(null); setStatus(null);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("files", sample, sample.name);
      const res = await fetch("/api/voice/clone", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cloning failed");
      setStatus("Voice cloned — it's now in your library below.");
      setName(""); setFile(null); setRecorded(null);
      onCloned();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cloning failed");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg transition hover:border-brand/40"
      >
        <Icon name="mic" size={13} className="text-brand" /> Clone your voice
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Clone your voice</p>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg">Close</button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Record ~30 seconds of clear speech (or upload a clip) and we&apos;ll create a private voice that sounds like you. Only clone a voice you have the right to use.
      </p>
      <div className="mt-2 space-y-2">
        <input className={input} placeholder="Voice name (e.g. Sam — my voice)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <div className="flex flex-wrap items-center gap-2">
          {canRecord && (
            <button
              onClick={toggleRecord}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${recording ? "border-danger text-danger" : "border-border text-fg hover:border-brand/40"}`}
            >
              <Icon name={recording ? "stop" : "mic"} size={13} />
              {recording ? "Stop recording" : recorded ? "Re-record" : "Record"}
            </button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg transition hover:border-brand/40">
            <Icon name="upload" size={13} /> Upload audio
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRecorded(null); }}
            />
          </label>
          {(recorded || file) && (
            <span className="text-xs text-success">{recorded ? "Recording ready" : file?.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy || recording}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Cloning…" : "Create voice"}
          </button>
          {status && <span className="text-sm text-success">{status}</span>}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </div>
    </div>
  );
}
