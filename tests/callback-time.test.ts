import { describe, it, expect } from "vitest";
import { parseCallbackTime, callbackLabel, MAX_CALLBACK_DAYS } from "@/lib/calls/callback-time";
import { scheduleRequestedCallback, parseRetryTask } from "@/lib/calls";
import { getProvider } from "@/lib/crm/registry";

// Friday, June 12 2026, 16:00 UTC — noon in New York, 9am in Los Angeles.
const NOW = new Date("2026-06-12T16:00:00Z");
const NY = "America/New_York";
const LA = "America/Los_Angeles";

const at = (text: string, tz?: string) => parseCallbackTime(text, NOW, tz)?.toISOString();

describe("parseCallbackTime — clock times in the prospect's zone", () => {
  it("reads 'at 3' as THEIR 3pm", () => {
    expect(at("in a meeting, can you call me at 3?", NY)).toBe("2026-06-12T19:00:00.000Z"); // 3pm EDT
    expect(at("driving — call me at 3", LA)).toBe("2026-06-12T22:00:00.000Z"); // 3pm PDT
  });

  it("rolls to the next occurrence when the time already passed today", () => {
    // No zone → UTC; 15:00Z is before NOW (16:00Z) → tomorrow.
    expect(at("call me at 3")).toBe("2026-06-13T15:00:00.000Z");
  });

  it("honors explicit minutes and meridiem", () => {
    expect(at("around 4:30pm works", NY)).toBe("2026-06-12T20:30:00.000Z");
    expect(at("try me at 8", NY)).toBe("2026-06-13T12:00:00.000Z"); // bare 8 = 8am, passed → tomorrow
    expect(at("call me at 9 in the evening", NY)).toBe("2026-06-13T01:00:00.000Z"); // 9pm EDT
  });

  it("combines a day word with a time", () => {
    expect(at("tomorrow at 9 is good", NY)).toBe("2026-06-13T13:00:00.000Z"); // 9am EDT
  });
});

describe("parseCallbackTime — day words and relative offsets", () => {
  it("maps dayparts to conventional hours", () => {
    expect(at("call me tomorrow morning", NY)).toBe("2026-06-13T13:00:00.000Z"); // 9am EDT
    expect(at("try me tomorrow", NY)).toBe("2026-06-13T14:00:00.000Z"); // bare tomorrow = 10am
    expect(at("this afternoon?", NY)).toBe("2026-06-12T18:00:00.000Z"); // 2pm EDT, still ahead at noon
    expect(at("tonight", NY)).toBe("2026-06-12T23:00:00.000Z"); // 7pm EDT
  });

  it("resolves weekdays to the NEXT one (a Friday 'friday' means next week)", () => {
    expect(at("monday works", NY)).toBe("2026-06-15T14:00:00.000Z"); // Mon 10am EDT
    expect(at("monday afternoon", NY)).toBe("2026-06-15T18:00:00.000Z"); // Mon 2pm EDT
    expect(at("friday", NY)).toBe("2026-06-19T14:00:00.000Z"); // said on a Friday
  });

  it("handles pure offsets without zone math", () => {
    expect(at("in 2 hours", LA)).toBe("2026-06-12T18:00:00.000Z");
    expect(at("give me 30 — call me in 30 minutes")).toBe("2026-06-12T16:30:00.000Z");
    expect(at("in an hour")).toBe("2026-06-12T17:00:00.000Z");
  });
});

describe("parseCallbackTime — conservative by design", () => {
  it("reads a bare meridiem time and 'noon' — the way reschedule replies arrive", () => {
    expect(at("4pm works for me", NY)).toBe("2026-06-12T20:00:00.000Z");
    expect(at("noon is good", NY)).toBe("2026-06-13T16:00:00.000Z"); // noon EDT already passed at NOW → tomorrow
  });

  it("returns null when no time is named", () => {
    expect(at("can't talk right now, call me back later")).toBeUndefined();
    expect(at("in a meeting")).toBeUndefined();
    expect(at("")).toBeUndefined();
  });

  it("never reads plain counts as times (no preposition, no meridiem)", () => {
    expect(at("I have 3 kids so mornings are chaos")).toBeUndefined();
    expect(at("I'll take 2")).toBeUndefined();
    // "looked at 2 vendors" DOES parse ("at 2" is time-shaped) — that's why the
    // inbound layer only books when the message asks for a call or a callback
    // is already pending, never on a parse alone.
    expect(at("we looked at 2 other vendors", NY)).toBeDefined();
  });

  it("rejects nonsense hours and far-future misparses", () => {
    expect(at("call me at 25")).toBeUndefined();
    expect(at(`in ${(MAX_CALLBACK_DAYS + 2) * 24} hours`)).toBeUndefined();
  });
});

describe("scheduleRequestedCallback → the autonomous runner's format", () => {
  it("writes a task parseRetryTask executes, due at the requested instant", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "Asked For Three", points: [{ channel: "phone", value: "+15550107788" }] });
    const when = new Date("2026-06-13T19:00:00Z");
    const ok = await scheduleRequestedCallback({ contactId: c.id, when, label: callbackLabel(when, NY) });
    expect(ok).toBe(true);

    const acts = await p.listActivitiesByContact!(c.id);
    const task = acts.find((a) => a.kind === "task" && a.summary.includes("asked for a callback"));
    expect(task).toBeTruthy();
    const parsed = parseRetryTask(task!.summary);
    expect(parsed).toBeTruthy();
    expect(parsed!.dueAt).toBe(when.toISOString());
    expect(task!.summary).toContain("Sat, Jun 13"); // the label reads in THEIR zone
  });
});
