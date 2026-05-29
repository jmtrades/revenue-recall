import Link from "next/link";
import { getCalendar } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const TYPE_COLOR: Record<string, string> = { close: "bg-success", task: "bg-warn", meeting: "bg-brand" };

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default async function CalendarPage() {
  const { events } = await getCalendar();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventsByDay = new Map<string, typeof events>();
  for (const e of events) {
    const d = new Date(e.date);
    const k = dayKey(d);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const agenda = events.slice(0, 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle={now.toLocaleString("en-US", { month: "long", year: "numeric" })} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-muted">
            {DOW.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const k = `${year}-${month}-${d}`;
              const dayEvents = eventsByDay.get(k) ?? [];
              const isToday = d === now.getDate();
              return (
                <div key={i} className={`min-h-[72px] rounded-lg border p-1.5 ${isToday ? "border-brand bg-brand-soft/20" : "border-border bg-surface-2/40"}`}>
                  <div className={`text-xs ${isToday ? "font-semibold text-brand" : "text-muted"}`}>{d}</div>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((e, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_COLOR[e.type]}`} />
                        <span className="truncate text-[10px] text-fg">{e.title.split(" · ")[1] ?? e.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && <span className="text-[10px] text-muted">+{dayEvents.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Upcoming">
          {agenda.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {agenda.map((e, i) => {
                const inner = (
                  <>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_COLOR[e.type]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{e.title}</p>
                      <p className="text-xs text-muted">{new Date(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                    </div>
                  </>
                );
                return (
                  <li key={i}>
                    {e.dealId ? (
                      <Link href={`/deals/${e.dealId}`} className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3 transition hover:border-brand/50">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
