import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { escapeHtml, bodyToHtml, brandedEmailHtml } from "@/lib/email-brand";
import { sendEmail, setEmailTransport } from "@/lib/comms";

describe("email brand wrapper", () => {
  it("escapes HTML so a body can never inject markup", () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)> & "quotes"`)).toBe("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;");
  });

  it("linkifies bare URLs and keeps trailing punctuation outside the link", () => {
    const html = bodyToHtml("Manage it here: https://app.example.com/meet?x=1.");
    expect(html).toContain(`<a href="https://app.example.com/meet?x=1"`);
    expect(html).toContain("</a>.");
  });

  it("converts newlines to <br> after escaping", () => {
    expect(bodyToHtml("line one\nline two")).toBe("line one<br>line two");
  });

  it("renders the full document with subject, body, and the brand mark", () => {
    const html = brandedEmailHtml({ subject: "Your weekly digest", body: "3 deals need attention." });
    expect(html).toContain("Your weekly digest");
    expect(html).toContain("3 deals need attention.");
    expect(html).toContain(">RR</td>");
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});

describe("sendEmail html boundary", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_FROM;
    process.env.EMAIL_WEBHOOK_URL = "https://hooks.example.com/email";
    setEmailTransport(null);
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.EMAIL_WEBHOOK_URL;
    setEmailTransport(null);
  });

  function captureFetch(): Record<string, unknown>[] {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return { ok: true, json: async () => ({ id: "wh_1", status: "sent" }) } as Response;
    }) as unknown as typeof fetch;
    return bodies;
  }

  it("product (internal) mail carries the branded HTML alternative", async () => {
    const bodies = captureFetch();
    await sendEmail("a@b.com", "Team invite", "You're invited: https://app.example.com/join", { internal: true });
    expect(typeof bodies[0].html).toBe("string");
    expect(String(bodies[0].html)).toContain("Team invite");
    // The text part is untouched — still the exact plaintext body.
    expect(bodies[0].body).toBe("You're invited: https://app.example.com/join");
  });

  it("prospect outreach stays plaintext-only — no html part, ever", async () => {
    const bodies = captureFetch();
    await sendEmail("a@b.com", "quick question", "hey — worth 15 min this week?");
    expect(bodies[0].html).toBeUndefined();
  });
});
