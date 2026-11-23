import { describe, it, expect } from "vitest";
import { FREE_SCHEDULE, runsThroughTheDay, WEBINAR_TICK_MS, AGENT_TICK_MS } from "@/lib/free/schedule";

/**
 * The autopilot only reaches prospects within their 8am–9pm local window and
 * holds the rest for the next run, so the scheduler MUST tick through the day.
 * A once-daily schedule (especially at a US-night UTC hour) silently means the
 * agent never calls. The free host runs this inside the Node process — there
 * is no Vercel cron.
 */
describe("free host schedule", () => {
  it("registers an hourly agent tick and a minute webinar tick", () => {
    expect(FREE_SCHEDULE.agent).toBe("0 * * * *");
    expect(FREE_SCHEDULE.webinar).toBe("* * * * *");
    expect(AGENT_TICK_MS).toBe(60 * 60_000);
    expect(WEBINAR_TICK_MS).toBe(60_000);
  });

  it("runs the agent through the day, never just once", () => {
    expect(runsThroughTheDay(FREE_SCHEDULE.agent)).toBe(true);
    expect(runsThroughTheDay("0 13 * * *")).toBe(false);
  });
});
