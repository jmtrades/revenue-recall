import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Contact } from "@/lib/crm/types";
import { isPublicRoute } from "@/lib/route-access";

const h = vi.hoisted(() => ({ contacts: [] as Contact[] }));

vi.mock("@/lib/crm/registry", async (orig) => ({
  ...(await orig<typeof import("@/lib/crm/registry")>()),
  resolveProvider: vi.fn(async () => ({
    info: () => ({ id: "builtin", label: "Built-in", capabilities: { read: true, write: true, activities: true, customFields: true }, ready: true }),
    listContacts: async () => h.contacts,
    updateContact: async (id: string, patch: { attributes?: Record<string, unknown> }) => {
      const c = h.contacts.find((x) => x.id === id)!;
      c.attributes = { ...(c.attributes ?? {}), ...(patch.attributes ?? {}) };
      return c;
    },
    logActivity: async () => ({}),
  })),
}));

import { listSuppressed, suppressEmail, unsuppressEmail } from "@/lib/suppression";
import { GET, POST } from "@/app/api/suppression/route";
import { _resetRateLimit } from "@/lib/ratelimit";

function contact(id: string, email: string, attributes: Record<string, unknown> = {}): Contact {
  return { id, name: `Contact ${id}`, points: [{ channel: "email", value: email }], attributes };
}

beforeEach(() => {
  _resetRateLimit();
  h.contacts = [
    contact("c1", "a@x.com", { doNotContact: true, optedOutAt: "2026-06-01T00:00:00Z" }),
    contact("c2", "b@x.com", { emailBounced: true, emailBouncedAt: "2026-06-05T00:00:00Z" }),
    contact("c3", "c@x.com"),
    contact("c4", "d@x.com", { doNotContact: true, emailBounced: true, optedOutAt: "2026-06-03T00:00:00Z" }),
  ];
});

describe("listSuppressed", () => {
  it("returns only suppressed contacts with reasons, newest first", async () => {
    const rows = await listSuppressed();
    expect(rows.map((r) => r.contactId)).toEqual(["c2", "c4", "c1"]); // by `at` desc
    expect(rows.find((r) => r.contactId === "c4")!.reasons.sort()).toEqual(["bounced", "opted_out"]);
    expect(rows.find((r) => r.contactId === "c2")!.email).toBe("b@x.com");
  });
});

describe("suppressEmail", () => {
  it("hard-suppresses every matching contact and is a no-op for an unknown address", async () => {
    expect(await suppressEmail("c@x.com")).toBe(1);
    expect(h.contacts.find((c) => c.id === "c3")!.attributes?.doNotContact).toBe(true);
    expect(await suppressEmail("nobody@x.com")).toBe(0);
  });
});

describe("unsuppressEmail", () => {
  it("clears both flags for a suppressed address, and no-ops a clean one", async () => {
    expect(await unsuppressEmail("d@x.com")).toBe(1); // c4 was both
    const c4 = h.contacts.find((c) => c.id === "c4")!;
    expect(c4.attributes?.doNotContact).toBe(false);
    expect(c4.attributes?.emailBounced).toBe(false);
    expect(await unsuppressEmail("c@x.com")).toBe(0); // c3 isn't suppressed
  });
});

describe("/api/suppression", () => {
  it("is authenticated (not public)", () => {
    expect(isPublicRoute("/api/suppression")).toBe(false);
  });

  it("GET lists; POST validates the email", async () => {
    const list = await GET(new Request("http://x/api/suppression"));
    expect(((await list.json()) as { suppressed: unknown[] }).suppressed.length).toBe(3);
    const bad = await POST(new Request("http://x/api/suppression", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nope" }) }));
    expect(bad.status).toBe(400);
    const ok = await POST(new Request("http://x/api/suppression", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "c@x.com" }) }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { flagged: number }).flagged).toBe(1);
  });
});
