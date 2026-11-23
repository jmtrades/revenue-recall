import Link from "next/link";
import { PageHeader, Stat, Card, EmptyState, Button } from "@/components/ui";
import { getOrgSettings } from "@/lib/org";
import { loadRoi } from "@/lib/roi/load";
import { webinarCounts } from "@/lib/webinar/store";
import { webinarArmed } from "@/lib/webinar/config";

export const metadata = { title: "Webinars" };
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  registered: "Registered",
  reminded: "Reminded",
  in_room: "In the room",
  left: "Left",
  pitch_drop: "Left at the offer",
  no_show: "No-show",
  replay: "Watching replay",
  attended: "Attended",
  follow_up: "Follow-up",
  booked: "Booked",
  opted_out: "Opted out",
  exhausted: "Done",
  wrong_number: "Wrong number",
};

export default async function WebinarsPage() {
  const [org, roi] = await Promise.all([getOrgSettings(), loadRoi()]);
  const counts = org.id ? await webinarCounts(org.id).catch(() => null) : null;
  const armed = webinarArmed();
  const states = Object.entries(counts?.byState ?? {}).sort((a, b) => b[1] - a[1]);
  const report = roi.report;
  const empty = !counts?.sessions && states.length === 0 && report.webinarJoined === 0 && report.webinarLeft === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Webinars"
        subtitle="Who registered, who left, and who the recovery path brought back. The room is live; this page only reads it."
        action={<Button href="/results" variant="outline" size="sm">Open results</Button>}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sessions" value={String(counts?.sessions ?? 0)} hint={armed ? "Recovery is armed" : "Waiting on a webhook secret"} />
        <Stat label="Joins" value={String(report.webinarJoined)} hint="in the last 30 days" />
        <Stat label="Left" value={String(report.webinarLeft)} hint="including offer-window drops" tone={report.webinarLeft > 0 ? "warn" : "default"} />
        <Stat label="Rescued" value={String(report.rescuedLeads)} hint="left, then rejoined, replied, or booked" tone={report.rescuedLeads > 0 ? "success" : "default"} />
      </section>

      {empty ? (
        <EmptyState
          iconName="screen"
          title="No webinar in this workspace yet"
          hint={armed
            ? "Point Zoom, Demio, GoTo, or WebinarJam at the webinar webhook. Joins, leaves, and replays show up here as soon as the first event arrives."
            : "Add the webinar webhook secret and the provider will be able to reach this workspace. Until then, nothing is collected."}
          action={<Button href="/settings">Settings</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card title="Where people are" className="lg:col-span-3">
            {states.length === 0 ? (
              <p className="text-sm text-muted">Sessions exist, but no registrant states have been recorded yet.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {states.map(([state, n]) => (
                  <li key={state} className="flex items-center justify-between rounded-xl bg-surface-2/70 px-3 py-2.5">
                    <span className="text-sm text-fg">{STATE_LABEL[state] ?? state}</span>
                    <span className="font-data text-sm tabular-nums text-body">{n}</span>
                  </li>
                ))}
              </ul>
            )}
            {counts && counts.pending > 0 && (
              <p className="mt-4 text-sm text-muted">{counts.pending} {counts.pending === 1 ? "person has" : "people have"} a recovery step still waiting to send.</p>
            )}
          </Card>
          <Card title="Recovery" className="lg:col-span-2">
            <p className="text-sm leading-relaxed text-body">
              A leave during the offer is a pitch drop. The engine calls while they are still near the room, then texts and emails within the consent and quiet-hour rules. This page does not change that path.
            </p>
            <p className="mt-3 text-sm text-muted">
              Rescued means someone left and later rejoined, replied, or booked. The count lives on <Link href="/results" className="text-brand hover:underline">Results</Link>, next to revenue and hours.
            </p>
            {!armed && <p className="mt-3 text-sm text-warn">The webhook secret is not set, so live events cannot arrive.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
