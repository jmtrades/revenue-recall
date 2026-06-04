import { describe, it, expect, beforeEach } from "vitest";
import { formToken, verifyFormToken, hostedFormUrl, formEmbedSnippet } from "@/lib/forms";
import { POST as submit } from "@/app/api/forms/submit/route";
import { getProvider } from "@/lib/crm/registry";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("form token", () => {
  it("verifies its own token and rejects tampering / cross-org reuse", () => {
    const t = formToken("org_1");
    expect(t).toBeTruthy();
    expect(verifyFormToken("org_1", t)).toBe(true);
    expect(verifyFormToken("org_1", t + "x")).toBe(false);
    expect(verifyFormToken("org_2", t)).toBe(false);
    expect(verifyFormToken("org_1", null)).toBe(false);
    expect(verifyFormToken("", t)).toBe(false);
  });

  it("fails closed in production when no secret is configured (no forgeable constant)", () => {
    const prevEnv = process.env.NODE_ENV;
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.INBOUND_TOKEN;
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "production";
    try {
      expect(formToken("org_1")).toBeNull();
      expect(verifyFormToken("org_1", "anything")).toBe(false);
      expect(hostedFormUrl("org_1")).toBeNull();
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.UNSUBSCRIBE_SECRET = "test-secret";
    }
  });

  it("builds hosted URL + embed only when a public base is set", () => {
    expect(hostedFormUrl("org_1")).toBeNull();
    expect(formEmbedSnippet("org_1")).toBeNull();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    expect(hostedFormUrl("org_1")).toContain("https://app.example.com/f/org_1?k=");
    expect(formEmbedSnippet("org_1")).toContain("<iframe");
  });
});

function formPost(fields: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v ?? "");
  return new Request("http://x/api/forms/submit", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
}

describe("POST /api/forms/submit", () => {
  it("rejects an invalid token (401)", async () => {
    const res = await submit(formPost({ org: "org_1", token: "bad", name: "X", email: "x@y.com" }));
    expect(res.status).toBe(401);
  });

  it("redirects back with error when name/contact missing", async () => {
    const res = await submit(formPost({ org: "org_1", token: formToken("org_1"), name: "" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("error=1");
  });

  it("creates a lead and redirects to the thank-you on a valid submission", async () => {
    const email = `web-${Date.now()}@acme.com`;
    const res = await submit(formPost({ org: "org_1", token: formToken("org_1"), name: "Form Lead", email, company: "Acme", website: "" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("sent=1");
    const contacts = await getProvider().listContacts();
    expect(contacts.some((c) => c.points.some((p) => p.value === email))).toBe(true);
  });

  it("traps bots via the honeypot without creating a lead", async () => {
    const name = `Honeypot ${Date.now()}`;
    const res = await submit(formPost({ org: "org_1", token: formToken("org_1"), name, email: "bot@spam.com", website: "http://spam" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("sent=1");
    const contacts = await getProvider().listContacts();
    expect(contacts.some((c) => c.name === name)).toBe(false);
  });

  it("returns JSON for a programmatic JSON submission", async () => {
    const res = await submit(
      new Request("http://x/api/forms/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org: "org_1", token: formToken("org_1") ?? "", name: "JSON Lead", email: `json-${Date.now()}@acme.com` }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
