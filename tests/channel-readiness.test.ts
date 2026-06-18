import { describe, it, expect } from "vitest";
import { emailReadiness, smsReadiness, voiceReadiness } from "@/lib/channels/readiness";

describe("emailReadiness", () => {
  it("logs (never blocks) when no real sender is connected", () => {
    const r = emailReadiness({ live: false, complianceOn: true, address: null, domainVerified: false });
    expect(r.state).toBe("logging");
    expect(r.canSend).toBe(false);
  });

  it("holds real email when connected but compliance prerequisites are unmet", () => {
    const r = emailReadiness({ live: true, complianceOn: true, address: null, domainVerified: false });
    expect(r.state).toBe("setup");
    expect(r.canSend).toBe(false);
    expect(r.blockers.length).toBe(2); // postal address + verified domain
  });

  it("is live when connected + verified domain + postal address", () => {
    const r = emailReadiness({ live: true, complianceOn: true, address: "123 Main St", domainVerified: true });
    expect(r.state).toBe("live");
    expect(r.canSend).toBe(true);
  });

  it("is live when the compliance master switch is off (operator opted out)", () => {
    const r = emailReadiness({ live: true, complianceOn: false, address: null, domainVerified: false });
    expect(r.state).toBe("live");
    expect(r.canSend).toBe(true);
  });
});

describe("smsReadiness", () => {
  it("holds real SMS until A2P 10DLC is registered", () => {
    const r = smsReadiness({ live: true, complianceOn: true, a2pRegistered: false });
    expect(r.state).toBe("setup");
    expect(r.canSend).toBe(false);
  });

  it("is live once a sender is connected and A2P is registered", () => {
    const r = smsReadiness({ live: true, complianceOn: true, a2pRegistered: true });
    expect(r.state).toBe("live");
  });

  it("logs when no texting is connected", () => {
    expect(smsReadiness({ live: false, complianceOn: true, a2pRegistered: false }).state).toBe("logging");
  });
});

describe("voiceReadiness", () => {
  it("logs when no calling is connected", () => {
    expect(voiceReadiness({ live: false, reachable: null, misdirected: false }).state).toBe("logging");
  });

  it("flags a misdirected gateway as setup-needed (not a false live)", () => {
    const r = voiceReadiness({ live: true, reachable: true, misdirected: true });
    expect(r.state).toBe("setup");
  });

  it("flags an unreachable gateway as setup-needed", () => {
    expect(voiceReadiness({ live: true, reachable: false, misdirected: false }).state).toBe("setup");
  });

  it("is live with a connected, reachable, correctly-pointed gateway", () => {
    expect(voiceReadiness({ live: true, reachable: true, misdirected: false }).state).toBe("live");
  });

  it("is live for direct telephony with no gateway URL to ping (reachable null)", () => {
    expect(voiceReadiness({ live: true, reachable: null, misdirected: false }).state).toBe("live");
  });
});
