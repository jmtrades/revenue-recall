"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Availability, MeetingLocationKind, MeetingType } from "@/lib/meetings/types";

/**
 * Settings → Scheduling. Three parts: the public booking link (copy / embed),
 * the weekly availability editor (one window per day in v1), and meeting-type
 * management. Writes go to /api/meetings/* (owner/admin), then refresh.
 */

const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  bookingUrl: string | null;
  embed: string | null;
  availability: Availability;
  meetingTypes: MeetingType[];
  canManage: boolean;
}

export function SchedulingSettings({ bookingUrl, embed, availability, meetingTypes, canManage }: Props) {
  return (
    <div className="space-y-4">
      <BookingLinkCard bookingUrl={bookingUrl} embed={embed} />
      {canManage ? (
        <>
          <AvailabilityCard availability={availability} />
          <MeetingTypesCard meetingTypes={meetingTypes} />
        </>
      ) : (
        <div className="card text-sm text-muted">Only an owner or admin can change scheduling settings.</div>
      )}
    </div>
  );
}

function BookingLinkCard({ bookingUrl, embed }: { bookingUrl: string | null; embed: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  }
  return (
    <div className="card">
      <h2 className="font-semibold text-fg">Your booking link</h2>
      <p className="mt-1 text-sm text-muted">
        Share this link or drop it into your outreach — prospects pick a time and it books straight onto your pipeline as a new deal. The
        link carries a write-only token (safe to put anywhere; it can only create a booking). Once you have an enabled meeting type, the AI
        offers this link automatically when a call is the natural next step (a custom scheduling link in your Voice settings overrides it).
      </p>
      {!bookingUrl ? (
        <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Set <code className="font-mono">NEXT_PUBLIC_SITE_URL</code> (and a signing secret) to turn on your public booking link.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Booking page</span>
              <div className="flex gap-3">
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">Open</a>
                <button onClick={() => copy("url", bookingUrl)} className="text-xs text-brand hover:underline">{copied === "url" ? "Copied!" : "Copy link"}</button>
              </div>
            </div>
            <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-fg">{bookingUrl}</code>
          </div>
          {embed && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Embed on your site</span>
                <button onClick={() => copy("embed", embed)} className="text-xs text-brand hover:underline">{copied === "embed" ? "Copied!" : "Copy"}</button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">{embed}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

function AvailabilityCard({ availability }: { availability: Availability }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tz, setTz] = useState(availability.timezone);
  const [days, setDays] = useState<DayState[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const w = availability.weekly[i]?.[0];
      return w ? { enabled: true, start: w.start, end: w.end } : { enabled: false, start: "09:00", end: "17:00" };
    }),
  );
  const [slotMinutes, setSlotMinutes] = useState(availability.slotMinutes);
  const [noticeHours, setNoticeHours] = useState(Math.round(availability.minNoticeMinutes / 60));
  const [horizonDays, setHorizonDays] = useState(availability.horizonDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setDay(i: number, patch: Partial<DayState>) {
    setDays((d) => d.map((day, idx) => (idx === i ? { ...day, ...patch } : day)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const weekly: Record<string, { start: string; end: string }[]> = {};
    days.forEach((d, i) => {
      if (d.enabled) weekly[String(i)] = [{ start: d.start, end: d.end }];
    });
    try {
      const res = await fetch("/api/meetings/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz.trim(), weekly, slotMinutes, minNoticeMinutes: noticeHours * 60, horizonDays }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save availability.");
        return;
      }
      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-fg">When you&apos;re available</h2>
      <p className="mt-1 text-sm text-muted">Prospects can only book inside these windows. Times are in your scheduling timezone.</p>

      <div className="mt-3">
        <label className="mb-1 block text-xs text-muted">Scheduling timezone (IANA, e.g. America/New_York)</label>
        <input className={field} value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/New_York" aria-label="Scheduling timezone" />
      </div>

      <div className="mt-4 space-y-2">
        {days.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <label className="flex w-32 items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={d.enabled} onChange={(e) => setDay(i, { enabled: e.target.checked })} aria-label={DAYS[i]} />
              {DAYS[i]}
            </label>
            {d.enabled ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <input type="time" className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-fg" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} aria-label={`${DAYS[i]} start`} />
                <span>to</span>
                <input type="time" className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-fg" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} aria-label={`${DAYS[i]} end`} />
              </div>
            ) : (
              <span className="text-sm text-muted">Unavailable</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Slot length</label>
          <select className={field} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} aria-label="Slot length">
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Minimum notice (hours)</label>
          <input type="number" min={0} max={336} className={field} value={noticeHours} onChange={(e) => setNoticeHours(Math.max(0, Number(e.target.value)))} aria-label="Minimum notice in hours" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Bookable up to (days out)</label>
          <input type="number" min={1} max={90} className={field} value={horizonDays} onChange={(e) => setHorizonDays(Math.min(90, Math.max(1, Number(e.target.value))))} aria-label="Booking horizon in days" />
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
          {busy ? "Saving…" : "Save availability"}
        </button>
        {saved && <span className="text-sm text-success">Saved.</span>}
      </div>
    </div>
  );
}

interface NewType {
  name: string;
  durationMinutes: number;
  locationKind: MeetingLocationKind;
  locationDetail: string;
}

const EMPTY_TYPE: NewType = { name: "", durationMinutes: 30, locationKind: "phone", locationDetail: "" };

function MeetingTypesCard({ meetingTypes }: { meetingTypes: MeetingType[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<NewType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings/types", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the meeting type.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Couldn't save — check your connection.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!form || !form.name.trim()) {
      setError("A meeting type needs a name.");
      return;
    }
    const ok = await mutate("POST", {
      name: form.name.trim(),
      durationMinutes: form.durationMinutes,
      locationKind: form.locationKind,
      locationDetail: form.locationDetail.trim() || undefined,
    });
    if (ok) setForm(null);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">Meeting types</h2>
        {!form && (
          <button onClick={() => { setForm(EMPTY_TYPE); setError(null); }} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand/90">
            New type
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">What people can book. With none configured, a 30-minute &ldquo;Intro call&rdquo; is offered by default.</p>

      {form && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <input className={field} placeholder="Name (e.g. Intro call)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Meeting type name" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Duration (minutes)</label>
              <input type="number" min={5} max={480} className={field} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Math.max(5, Number(e.target.value)) })} aria-label="Duration" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Location</label>
              <select className={field} value={form.locationKind} onChange={(e) => setForm({ ...form, locationKind: e.target.value as MeetingLocationKind })} aria-label="Location">
                <option value="phone">Phone call</option>
                <option value="video">Video call</option>
                <option value="in_person">In person</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <input className={field} placeholder="Location detail (optional — dial-in, video link, address)" value={form.locationDetail} onChange={(e) => setForm({ ...form, locationDetail: e.target.value })} aria-label="Location detail" />
          {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={busy || !form.name.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
              {busy ? "Saving…" : "Create"}
            </button>
            <button onClick={() => { setForm(null); setError(null); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-fg">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {meetingTypes.length === 0 && !form && <p className="text-sm text-muted">No custom meeting types yet.</p>}
        {meetingTypes.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <div>
              <span className="text-sm font-medium text-fg">{t.name}</span>
              <span className="ml-2 text-xs text-muted">{t.durationMinutes} min · {t.locationKind.replace("_", " ")}{t.enabled ? "" : " · disabled"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => mutate("PATCH", { id: t.id, enabled: !t.enabled })} disabled={busy} className="rounded-lg border border-border px-3 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50">
                {t.enabled ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => { if (window.confirm(`Delete the "${t.name}" meeting type?`)) void mutate("DELETE", { id: t.id }); }}
                disabled={busy}
                className="rounded-lg border border-danger/40 px-3 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && !form && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
