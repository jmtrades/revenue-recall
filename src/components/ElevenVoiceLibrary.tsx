"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

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

export function ElevenVoiceLibrary() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/library");
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setVoices(Array.isArray(data.voices) ? data.voices : []);
      setSelected(data.selected ?? null);
      if (data.error) setError(data.error);
    } catch {
      setConfigured(false);
    }
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

  async function preview(v: Voice) {
    audioRef.current?.pause();
    if (previewing === v.id) {
      setPreviewing(null);
      return;
    }
    setPreviewing(v.id);
    setError(null);
    try {
      // The provider's own sample is instant and free when present; otherwise
      // synthesize a real opener in this voice so you hear it on a call.
      let url = v.previewUrl ?? null;
      let revoke = false;
      if (!url) {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: PREVIEW_LINE, voiceId: sel(v.id), emotion: "warm", quality: "max" }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => null);
          throw new Error(b?.error ?? "Preview failed");
        }
        url = URL.createObjectURL(await res.blob());
        revoke = true;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPreviewing((p) => (p === v.id ? null : p));
        if (revoke && url) URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
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

  if (configured === null || configured === false) return null;

  const clones = voices.filter((v) => v.cloned);
  const stock = voices.filter((v) => !v.cloned);

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium text-fg">Read-aloud voice (ElevenLabs)</p>
        <p className="text-xs text-muted">
          The voice the app speaks in for read-alouds and previews. Pick from the catalogue below, or clone your own — tap ▶ to hear each one.
        </p>
      </div>

      <CloneVoice onCloned={load} />

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
