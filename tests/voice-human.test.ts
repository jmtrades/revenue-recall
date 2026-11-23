import { describe, expect, it } from "vitest";
import { HUMAN_VOICE, callVoiceProfile, elevenModel, elevenSettings } from "@/lib/voice/tts";
import { validateCloneRequest, MAX_CLONE_SAMPLES } from "@/lib/voice/clone-request";
import { resolveSpokenVoice, setVoiceAssignment, getVoiceAssignments, __resetVoiceAssignmentsForTests } from "@/lib/voice/assignments";
import { integrationStatus } from "@/lib/integrations/status";

describe("human voice delivery", () => {
  it("uses stability 0.4, similarity 0.8, style 0.3, and speaker boost on calls and voicemails", () => {
    for (const purpose of ["call", "voicemail"] as const) {
      expect(elevenSettings("energetic", 1, purpose)).toEqual(HUMAN_VOICE);
    }
    expect(HUMAN_VOICE).toMatchObject({ stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true });
  });

  it("speaks live calls on turbo v2.5 and voicemails on multilingual v2", () => {
    expect(elevenModel("realtime")).toBe("eleven_turbo_v2_5");
    expect(elevenModel("voicemail")).toBe("eleven_multilingual_v2");
    expect(callVoiceProfile("eleven:abc").voice).toMatchObject({
      callModel: "eleven_turbo_v2_5",
      voicemailModel: "eleven_multilingual_v2",
      speakerBoost: true,
    });
  });
});

describe("clone request", () => {
  it("requires consent and between 1 and 25 samples", () => {
    expect(validateCloneRequest({ name: "Sam", fileCount: 1, consent: false })).toMatch(/agreed/);
    expect(validateCloneRequest({ name: "", fileCount: 1, consent: true })).toMatch(/name/);
    expect(validateCloneRequest({ name: "Sam", fileCount: 0, consent: true })).toMatch(/sample/);
    expect(validateCloneRequest({ name: "Sam", fileCount: MAX_CLONE_SAMPLES + 1, consent: true })).toMatch(/25/);
    expect(validateCloneRequest({ name: "Sam", fileCount: 3, consent: true })).toBeNull();
  });
});

describe("voice assignments", () => {
  it("prefers a webinar voice, then a campaign voice, then the workspace", async () => {
    __resetVoiceAssignmentsForTests();
    await setVoiceAssignment("local", "campaign", "seq-1", "eleven:campaign");
    await setVoiceAssignment("local", "webinar", "room-1", "eleven:webinar");
    const assignments = await getVoiceAssignments("local");
    expect(resolveSpokenVoice({ assignments, campaignId: "seq-1", webinarId: "room-1", workspaceVoice: "eleven:org" })).toBe("eleven:webinar");
    expect(resolveSpokenVoice({ assignments, campaignId: "seq-1", workspaceVoice: "eleven:org" })).toBe("eleven:campaign");
    expect(resolveSpokenVoice({ assignments, workspaceVoice: "eleven:org" })).toBe("eleven:org");
    __resetVoiceAssignmentsForTests();
  });
});

describe("integration status", () => {
  it("reports missing keys without echoing their values", () => {
    const rows = integrationStatus({ ELEVENLABS_API_KEY: "secret-value", RESEND_API_KEY: "" });
    const voice = rows.find((r) => r.id === "elevenlabs");
    const email = rows.find((r) => r.id === "email");
    expect(voice?.ok).toBe(true);
    expect(email?.ok).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("secret-value");
  });
});
