import { describe, it, expect } from "vitest";
import { nextPendingIndex, QUICK_OUTCOMES, quickOutcome, dialerKeyAction, phoneKey, duplicatePhoneIndexes } from "@/lib/dialer-flow";
import { isRetryableOutcome, isVoicemailOutcome } from "@/lib/calls/retry";

describe("power-dialer queue advance", () => {
  const done = (set: number[]) => (i: number) => set.includes(i);

  it("finds the next not-done index after the current one", () => {
    expect(nextPendingIndex(5, done([]), 0)).toBe(1);
    expect(nextPendingIndex(5, done([1, 2]), 0)).toBe(3); // skips wrapped deals
    expect(nextPendingIndex(5, done([1, 2, 3, 4]), 0)).toBe(-1); // none left
  });

  it("returns -1 from the last position", () => {
    expect(nextPendingIndex(3, done([]), 2)).toBe(-1);
  });
});

describe("one-tap no-connect outcomes", () => {
  it("covers the bulk-of-the-day no-connect set", () => {
    expect(QUICK_OUTCOMES.map((o) => o.id)).toEqual(["no_answer", "voicemail", "busy"]);
  });

  it("every quick outcome re-queues the deal (the retry scheduler matches its line)", () => {
    for (const o of QUICK_OUTCOMES) {
      expect(isRetryableOutcome(o.line), `${o.id} should be retryable`).toBe(true);
    }
  });

  it("the voicemail outcome is detected as a voicemail (drives the follow-up cadence)", () => {
    expect(isVoicemailOutcome(quickOutcome("voicemail")!.line)).toBe(true);
    expect(isVoicemailOutcome(quickOutcome("no_answer")!.line)).toBe(false);
  });

  it("each line leads with its bracketed label so the timeline reads cleanly", () => {
    for (const o of QUICK_OUTCOMES) expect(o.line.startsWith(`[${o.label}]`)).toBe(true);
  });
});

describe("dialer keyboard map", () => {
  const free = { typing: false, modifier: false };

  it("routes C/1/2/3/N to call, the three quick outcomes, and next (case-insensitive)", () => {
    expect(dialerKeyAction("c", free)).toEqual({ kind: "call" });
    expect(dialerKeyAction("C", free)).toEqual({ kind: "call" });
    expect(dialerKeyAction("1", free)).toEqual({ kind: "quick", outcomeId: "no_answer" });
    expect(dialerKeyAction("2", free)).toEqual({ kind: "quick", outcomeId: "voicemail" });
    expect(dialerKeyAction("3", free)).toEqual({ kind: "quick", outcomeId: "busy" });
    expect(dialerKeyAction("n", free)).toEqual({ kind: "next" });
  });

  it("never fires while typing or with a modifier held (browser shortcuts intact)", () => {
    expect(dialerKeyAction("c", { typing: true, modifier: false })).toBeNull();
    expect(dialerKeyAction("1", { typing: false, modifier: true })).toBeNull(); // e.g. Cmd+1 tab switch
  });

  it("ignores unmapped keys", () => {
    for (const k of ["x", "4", "Enter", "Escape", " "]) expect(dialerKeyAction(k, free)).toBeNull();
  });
});

describe("duplicate-number detection in the queue", () => {
  it("matches the same number across formats via the last 10 digits", () => {
    expect(phoneKey("+1 (415) 555-0100")).toBe("4155550100");
    expect(phoneKey("4155550100")).toBe("4155550100");
    expect(phoneKey("415.555.0100")).toBe("4155550100");
    expect(phoneKey("555-0100")).toBeNull(); // too short to claim a match
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
  });

  it("flags later entries that share a number with an earlier one, never the first", () => {
    const queue = [
      { phone: "+1 (415) 555-0100", contactName: "Dana Original" },
      { phone: "212-555-0199", contactName: "Different Person" },
      { phone: "4155550100", contactName: "Dana Duplicate Row" },
      { phone: "415-555-0100", contactName: "Dana Third Row" },
    ];
    const dups = duplicatePhoneIndexes(queue);
    expect(dups.has(0)).toBe(false);
    expect(dups.has(1)).toBe(false);
    expect(dups.get(2)).toEqual({ firstName: "Dana Original", firstIndex: 0 });
    expect(dups.get(3)).toEqual({ firstName: "Dana Original", firstIndex: 0 }); // both point at the first
  });

  it("never matches on short or missing numbers", () => {
    const dups = duplicatePhoneIndexes([
      { phone: "0100", contactName: "A" },
      { phone: "0100", contactName: "B" },
      { phone: "", contactName: "C" },
    ]);
    expect(dups.size).toBe(0);
  });
});
