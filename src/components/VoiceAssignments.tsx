"use client";

import { useEffect, useState } from "react";

interface Voice {
  id: string;
  name: string;
}
interface Assignments {
  campaigns: Record<string, string>;
  webinars: Record<string, string>;
}

export function VoiceAssignments() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [assignments, setAssignments] = useState<Assignments>({ campaigns: {}, webinars: {} });
  const [campaignId, setCampaignId] = useState("");
  const [webinarId, setWebinarId] = useState("");
  const [campaignVoice, setCampaignVoice] = useState("");
  const [webinarVoice, setWebinarVoice] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [lib, saved] = await Promise.all([
        fetch("/api/voice/library").then((r) => r.json()).catch(() => ({})),
        fetch("/api/voice/assignments").then((r) => r.json()).catch(() => ({})),
      ]);
      setVoices(Array.isArray(lib.voices) ? lib.voices : []);
      if (saved.assignments) setAssignments(saved.assignments);
    })();
  }, []);

  async function save(kind: "campaign" | "webinar", id: string, voiceId: string) {
    if (!id.trim()) return setNote("Add an id first.");
    const res = await fetch("/api/voice/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id: id.trim(), voiceId: voiceId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setNote(data.error ?? "Couldn't save that voice.");
    setAssignments(data.assignments);
    setNote(voiceId ? "Saved. Calls for that id use this voice." : "Cleared.");
  }

  const field = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg";

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-sm font-medium text-fg">Per sequence and webinar</h2>
        <p className="mt-1 text-sm text-muted">A specific id wins over the workspace voice. Leave the voice blank to clear it.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className={field} aria-label="Sequence id" placeholder="Sequence id" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
        <select className={field} aria-label="Sequence voice" value={campaignVoice} onChange={(e) => setCampaignVoice(e.target.value)}>
          <option value="">Workspace default</option>
          {voices.map((v) => <option key={v.id} value={`eleven:${v.id}`}>{v.name}</option>)}
        </select>
        <button type="button" className="rounded-full bg-brand-strong px-4 py-2 text-sm font-medium text-white" onClick={() => save("campaign", campaignId, campaignVoice)}>Save</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className={field} aria-label="Webinar id" placeholder="Webinar session id" value={webinarId} onChange={(e) => setWebinarId(e.target.value)} />
        <select className={field} aria-label="Webinar voice" value={webinarVoice} onChange={(e) => setWebinarVoice(e.target.value)}>
          <option value="">Workspace default</option>
          {voices.map((v) => <option key={v.id} value={`eleven:${v.id}`}>{v.name}</option>)}
        </select>
        <button type="button" className="rounded-full bg-brand-strong px-4 py-2 text-sm font-medium text-white" onClick={() => save("webinar", webinarId, webinarVoice)}>Save</button>
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
      <ul className="space-y-1 text-xs text-muted">
        {Object.entries(assignments.campaigns).map(([id, voice]) => <li key={`c-${id}`}>Sequence {id}: {voice}</li>)}
        {Object.entries(assignments.webinars).map(([id, voice]) => <li key={`w-${id}`}>Webinar {id}: {voice}</li>)}
      </ul>
    </section>
  );
}
