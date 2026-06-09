import { describe, it, expect } from "vitest";
import { summarizeCall } from "@/lib/ai/callSummary";

// AI is unconfigured in the test env, so summarizeCall takes the template path —
// which is exactly the path the dialer hits when there's no AI key or no notes.
describe("summarizeCall outcome handling", () => {
  it("defaults an empty-notes call to no_answer, not 'connected'", async () => {
    const r = await summarizeCall({ contactName: "Pat", dealTitle: "Deal", notes: "" });
    expect(r.outcome).toBe("no_answer");
  });

  it("lets an explicit rep-chosen outcome override the inferred one", async () => {
    const r = await summarizeCall({ contactName: "Pat", dealTitle: "Deal", notes: "left a voicemail", outcome: "meeting_booked" });
    expect(r.outcome).toBe("meeting_booked");
  });

  it("still infers from notes when no explicit outcome is given", async () => {
    const r = await summarizeCall({ contactName: "Pat", dealTitle: "Deal", notes: "they said not interested" });
    expect(r.outcome).toBe("not_interested");
  });
});
