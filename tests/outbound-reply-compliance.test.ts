import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setEmailTransport, type EmailTransport } from "@/lib/comms";
import { getProvider } from "@/lib/crm/registry";
import { sendReply } from "@/lib/outbound";

// sendReply backs the Approvals "approve & send" flow (and any reply-on-the-same-
// channel send). For email that's commercial outreach, so it must carry the same
// CAN-SPAM footer the autonomous engine sends — including a per-contact one-click
// unsubscribe link, not just the reply-based fallback. Regression guard for the
// gap where the email branch sent with no compliance opts.

const SITE = "https://app.example.test";
const CLEAR = ["RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_WEBHOOK_URL", "COMPLIANCE_ADDRESS", "OUTBOUND_ORG_NAME"];

let sent: { to: string; subject: string; body: string }[] = [];

function captureTransport(): EmailTransport {
  return {
    id: "capture",
    available: () => true,
    send: async (m) => {
      sent.push({ to: m.to, subject: m.subject, body: m.body });
      return { id: "cap_1", status: "sent", provider: "capture" };
    },
  };
}

beforeEach(() => {
  sent = [];
  for (const k of CLEAR) delete process.env[k];
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  setEmailTransport(captureTransport());
});
afterEach(() => {
  setEmailTransport(null);
  delete process.env.NEXT_PUBLIC_SITE_URL;
  for (const k of CLEAR) delete process.env[k];
});

describe("sendReply email compliance", () => {
  it("appends a one-click unsubscribe link (not just the reply fallback) on email replies", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Reply Test", points: [{ channel: "email", value: "reply@example.com" }] });

    const res = await sendReply({ contact, channel: "email", subject: "Following up", body: "Just circling back on this." });
    expect(res.status).toBe("sent");
    expect(sent).toHaveLength(1);

    // The one-click link the engine/cadence sends — proves the org's compliance
    // identity is threaded through, not dropped.
    expect(sent[0].body).toContain(`Unsubscribe: ${SITE}/api/unsubscribe?c=${contact.id}`);
    // And NOT the weaker reply-based fallback that the un-threaded path produced.
    expect(sent[0].body).not.toMatch(/Reply "unsubscribe"/i);
  });
});
