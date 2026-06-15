import { describe, it, expect } from "vitest";
import { hostedDisableOnStatus } from "@/lib/voice/neural";

// Read-aloud must not permanently drop to the browser voice after one transient
// error — only a config/entitlement failure disables the hosted ElevenLabs path.
describe("hostedDisableOnStatus", () => {
  it("disables only on config/entitlement failures (401/403/503)", () => {
    for (const s of [401, 403, 503]) expect(hostedDisableOnStatus(s)).toBe(true);
  });
  it("keeps ElevenLabs available after a transient error (429/5xx/4xx)", () => {
    for (const s of [429, 500, 502, 504, 400, 404, 408]) expect(hostedDisableOnStatus(s)).toBe(false);
  });
});
