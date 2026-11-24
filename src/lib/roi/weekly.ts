import { money } from "@/lib/format";
import type { RoiReport } from "@/lib/roi/model";

export interface WeeklySummary {
  subject: string;
  body: string;
}

/**
 * Email-ready weekly results. Every number comes from the report. When the
 * window is empty, the letter says so — it does not invent a result.
 */
export function buildWeeklySummary(report: RoiReport, orgName: string, resultsUrl?: string | null): WeeklySummary {
  const subject = `Your week with Revenue Recall — ${orgName}`;
  const cur = report.currency;
  const from = report.from.slice(0, 10);
  const to = report.to.slice(0, 10);
  const quiet =
    report.current.sent === 0 &&
    report.current.replies === 0 &&
    report.revenueRecovered === 0 &&
    report.rescuedLeads === 0 &&
    report.current.booked === 0;

  if (quiet) {
    const lines = [
      `${orgName} — nothing was logged from ${from} to ${to}.`,
      "",
      "When the system sends, calls, recovers a webinar lead, or books a meeting, the numbers will show up here. An empty week is an empty week.",
    ];
    if (resultsUrl) lines.push("", `Results: ${resultsUrl}`);
    return { subject, body: lines.join("\n") };
  }

  const lines = [
    `${orgName} — results from ${from} to ${to}.`,
    "",
    `Revenue recovered: ${money(report.revenueRecovered, cur)} across ${report.wonDeals} won ${report.wonDeals === 1 ? "deal" : "deals"}`,
    `Leads rescued from webinar drop-off: ${report.rescuedLeads}`,
    `Hours saved (estimated): ${report.hoursSaved}`,
    `Sends and dials: ${report.current.sent} · Replies: ${report.current.replies} · Booked: ${report.current.booked}`,
  ];
  if (report.medianResponseMinutes !== null) {
    const mins = Math.round(report.medianResponseMinutes);
    lines.push(`Median time from send to reply: ${mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`}`);
  }
  if (report.channels.length) {
    lines.push("", "By channel");
    for (const c of report.channels) {
      lines.push(
        `  ${c.channel} — ${c.touches} touches · ${c.replies} replies · ${c.connects} connects · ${money(c.revenue, cur)} recovered`,
      );
    }
  }
  if (report.insights.length) {
    lines.push("", "What to change");
    for (const insight of report.insights) {
      lines.push(`  ${insight.title}. ${insight.recommendation}`);
    }
  }
  lines.push("", report.hoursNote);
  if (resultsUrl) lines.push("", `Full results: ${resultsUrl}`);
  return { subject, body: lines.join("\n") };
}
