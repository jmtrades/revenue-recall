/**
 * How often a self-hosted process works the pipeline. No paid cron service:
 * the Node process itself fires these. The agent must run through the day
 * (a single fixed hour would skip everyone who is in quiet hours then).
 * Webinar redials are due on the minute.
 */
export const FREE_SCHEDULE = {
  agent: "0 * * * *",
  webinar: "* * * * *",
} as const;

export const WEBINAR_TICK_MS = 60_000;
export const AGENT_TICK_MS = 60 * 60_000;

/** True when the cron hour field is not a single fixed hour. */
export function runsThroughTheDay(cron: string): boolean {
  const hourField = cron.trim().split(/\s+/)[1] ?? "";
  return !/^\d+$/.test(hourField);
}
