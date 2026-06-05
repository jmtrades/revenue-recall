import { describe, it, expect } from "vitest";
import { voicemailScript, VOICEMAIL_REACTIVATION_GAP_DAYS } from "@/lib/voice/voicemail";

describe("voicemailScript — the spoken message left on a machine", () => {
  it("is a short, spoken line (no newlines, no email sign-off block)", () => {
    const vm = voicemailScript({ contactName: "Jordan Lee", repName: "Alex", dealTitle: "the rollout" });
    expect(vm).not.toContain("\n");
    expect(vm.length).toBeLessThan(260);
    expect(vm).toMatch(/Jordan/); // greets by first name
  });

  it("names the rep when known, else stays generic", () => {
    expect(voicemailScript({ contactName: "Sam", repName: "Alex" })).toContain("it's Alex");
    expect(voicemailScript({ contactName: "Sam" })).toContain("it's me");
  });

  it("references the deal only when provided — no dangling 'about'", () => {
    const withDeal = voicemailScript({ contactName: "Sam", dealTitle: "the Q3 renewal", seed: "s1" });
    expect(withDeal).toContain("the Q3 renewal");
    const noDeal = voicemailScript({ contactName: "Sam", seed: "s1" });
    expect(noDeal).not.toMatch(/about\s*[.?]/); // no "about ." / "about?" artifact
    expect(noDeal).not.toContain("undefined");
  });

  it("flips to a warm 'been a while' reactivation message past the gap threshold", () => {
    const cold = voicemailScript({ contactName: "Sam", daysSinceContact: VOICEMAIL_REACTIVATION_GAP_DAYS + 5, seed: "g" });
    expect(cold.toLowerCase()).toMatch(/while|been a minute|pick things back up/);
    const fresh = voicemailScript({ contactName: "Sam", daysSinceContact: 2, seed: "g" });
    expect(fresh.toLowerCase()).not.toMatch(/it's been a while|been a minute/);
  });

  it("falls back to 'there' when no name is known", () => {
    expect(voicemailScript({})).toContain("there");
    expect(voicemailScript({})).not.toContain("undefined");
  });

  it("is deterministic for a given seed and varies across seeds", () => {
    const a = voicemailScript({ contactName: "Sam", dealTitle: "X", seed: "fixed" });
    const b = voicemailScript({ contactName: "Sam", dealTitle: "X", seed: "fixed" });
    expect(a).toBe(b); // stable across calls/retries/previews
    const seeds = ["s0", "s1", "s2", "s3", "s4", "s5"].map((s) => voicemailScript({ contactName: "Sam", dealTitle: "X", seed: s }));
    expect(new Set(seeds).size).toBeGreaterThan(1); // not a constant
  });
});
