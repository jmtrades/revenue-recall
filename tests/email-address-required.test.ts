import { describe, it, expect, afterEach } from "vitest";
import { sendEmail, setEmailTransport, type EmailMessage } from "@/lib/comms";

const env = process.env as Record<string, string | undefined>;
const prevEnv = process.env.NODE_ENV;

function liveTransport(captured: { value: EmailMessage | null }) {
  setEmailTransport({
    id: "test",
    available: () => true,
    send: async (m) => {
      captured.value = m;
      return { id: "ok", status: "sent", provider: "test" };
    },
  });
}

afterEach(() => {
  setEmailTransport(null);
  env.NODE_ENV = prevEnv;
  delete env.COMPLIANCE_ADDRESS;
  delete env.COMPLIANCE_REQUIRE_ADDRESS;
  delete env.OUTBOUND_COMPLIANCE;
});

describe("CAN-SPAM: commercial email refuses to send without a postal address in production", () => {
  it("blocks an outreach email with no address configured", async () => {
    const captured = { value: null as EmailMessage | null };
    liveTransport(captured);
    env.NODE_ENV = "production";
    const r = await sendEmail("lead@example.com", "Hi", "Quick follow-up");
    expect(r.status).toBe("failed");
    expect(r.provider).toBe("compliance");
    expect(r.detail).toMatch(/postal address/i);
    expect(captured.value).toBeNull(); // nothing reached the transport
  });

  it("sends once an address is configured (org-level or env)", async () => {
    const captured = { value: null as EmailMessage | null };
    liveTransport(captured);
    env.NODE_ENV = "production";
    const r = await sendEmail("lead@example.com", "Hi", "Quick follow-up", { compliance: { orgName: "Acme", address: "1 Main St, Austin TX" } });
    expect(r.status).toBe("sent");
    expect(captured.value?.body).toContain("1 Main St, Austin TX");
  });

  it("internal product mail (digests, invites) is exempt — not commercial outreach", async () => {
    const captured = { value: null as EmailMessage | null };
    liveTransport(captured);
    env.NODE_ENV = "production";
    const r = await sendEmail("owner@example.com", "Your digest", "Today's pipeline…", { internal: true });
    expect(r.status).toBe("sent");
  });

  it("COMPLIANCE_REQUIRE_ADDRESS=false relaxes the gate (address added upstream)", async () => {
    const captured = { value: null as EmailMessage | null };
    liveTransport(captured);
    env.NODE_ENV = "production";
    env.COMPLIANCE_REQUIRE_ADDRESS = "false";
    const r = await sendEmail("lead@example.com", "Hi", "Quick follow-up");
    expect(r.status).toBe("sent");
  });

  it("outside production the gate stays open (local dev never blocks)", async () => {
    const captured = { value: null as EmailMessage | null };
    liveTransport(captured);
    const r = await sendEmail("lead@example.com", "Hi", "Quick follow-up");
    expect(r.status).toBe("sent");
  });
});
