"use client";

import { useMemo, useState } from "react";
import { fill, type ProspectStrings } from "@/lib/i18n/prospect";
import type { BookableSlot } from "@/lib/meetings/types";

interface MeetingOption {
  slug: string;
  name: string;
  durationMinutes: number;
  location: string;
}

interface Props {
  org: string;
  token: string;
  brand: string;
  meeting: MeetingOption;
  /** Other enabled meeting types, for switching (navigates to ?t=slug). */
  others: { slug: string; name: string }[];
  slots: BookableSlot[];
  /** Prospect-facing strings in the org's selling language. */
  s: ProspectStrings;
}

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-brand";

export function BookingWidget({ org, token, brand, meeting, others, slots, s }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string } | null>(null);

  const localTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  // Group the absolute UTC slots into the viewer's local days.
  const days = useMemo(() => groupByLocalDay(slots), [slots]);
  const [activeDay, setActiveDay] = useState<string | null>(days[0]?.key ?? null);
  const active = days.find((d) => d.key === activeDay) ?? days[0];

  async function submit(form: HTMLFormElement) {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const data = new FormData(form);
    try {
      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          org,
          token,
          slug: meeting.slug,
          start: selected,
          name: String(data.get("name") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          phone: String(data.get("phone") ?? "").trim(),
          notes: String(data.get("notes") ?? "").trim(),
          website: String(data.get("website") ?? ""),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error || s.bookingFailed);
        setSubmitting(false);
        return;
      }
      setDone({ when: formatLong(selected) });
    } catch {
      setError(s.networkError);
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/15 text-2xl text-success">✓</div>
        <h1 className="font-display text-lg font-semibold text-fg">{s.bookedTitle}</h1>
        <p className="mt-2 text-sm text-muted">{fill(s.bookedWith, { meeting: meeting.name, brand })}</p>
        <p className="mt-1 text-sm font-medium text-fg">{done.when}</p>
        <p className="mt-3 text-xs text-muted">{s.bookedFootnote}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-fg">{fill(s.bookingHeading, { meeting: meeting.name, brand })}</h1>
      <p className="mt-1 text-sm text-muted">
        {meeting.durationMinutes} {s.minutes} · {meeting.location} · {fill(s.timesIn, { tz: localTz })}
      </p>

      {others.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <a href={`/book/${encodeURIComponent(org)}?k=${token}&t=${encodeURIComponent(meeting.slug)}`} className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
            {meeting.name}
          </a>
          {others.map((o) => (
            <a key={o.slug} href={`/book/${encodeURIComponent(org)}?k=${token}&t=${encodeURIComponent(o.slug)}`} className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-fg">
              {o.name}
            </a>
          ))}
        </div>
      )}

      {days.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface-2 px-3 py-4 text-center text-sm text-muted">{s.noTimes}</p>
      ) : !selected ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]">
          {/* Days */}
          <div className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setActiveDay(d.key)}
                className={`whitespace-nowrap rounded-lg border px-3 py-2 text-left text-sm transition ${d.key === active?.key ? "border-brand bg-brand/5 text-fg" : "border-border text-muted hover:text-fg"}`}
              >
                {d.label}
                <span className="ml-1 text-xs text-muted">({d.slots.length})</span>
              </button>
            ))}
          </div>
          {/* Times */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {active?.slots.map((sl) => (
              <button
                key={sl.start}
                type="button"
                onClick={() => setSelected(sl.start)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg transition hover:border-brand hover:bg-brand/5"
              >
                {formatTime(sl.start)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-fg">
            {formatLong(selected)}
            <button type="button" onClick={() => setSelected(null)} className="ml-2 text-xs font-medium text-brand underline">
              {s.change}
            </button>
          </div>
          {/* Honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
          <div>
            <label className="mb-1 block text-xs text-muted">{s.labelName} *</label>
            <input name="name" required maxLength={200} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{s.labelEmail}</label>
            <input name="email" type="email" maxLength={200} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{s.labelPhone}</label>
            <input name="phone" type="tel" maxLength={40} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{s.labelNotes}</label>
            <textarea name="notes" rows={2} maxLength={2000} className={field} />
          </div>
          {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-60">
            {submitting ? s.confirming : s.confirm}
          </button>
          <p className="text-center text-[11px] text-muted">{s.bookingFootnote}</p>
        </form>
      )}
    </div>
  );
}

interface DayGroup {
  key: string;
  label: string;
  slots: BookableSlot[];
}

function groupByLocalDay(slots: BookableSlot[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const s of slots) {
    const d = new Date(s.start);
    const key = d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz — stable sort key
    const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    let g = map.get(key);
    if (!g) {
      g = { key, label, slots: [] };
      map.set(key, g);
    }
    g.slots.push(s);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatLong(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
