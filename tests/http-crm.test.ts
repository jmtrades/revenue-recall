import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HttpCrmProvider } from "@/lib/crm/providers/http";

const realFetch = global.fetch;

beforeEach(() => {
  delete process.env.CRM_HTTP_BASE_URL;
  delete process.env.CRM_HTTP_TOKEN;
});
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("generic HTTP CRM adapter", () => {
  it("is not ready without a base URL", () => {
    expect(new HttpCrmProvider().info().ready).toBe(false);
    expect(new HttpCrmProvider().info().id).toBe("http");
  });

  it("is ready once CRM_HTTP_BASE_URL is set", () => {
    process.env.CRM_HTTP_BASE_URL = "https://my-crm.example.com/api";
    const info = new HttpCrmProvider().info();
    expect(info.ready).toBe(true);
    expect(info.capabilities.write).toBe(true);
  });

  it("calls the right endpoint with a bearer token and trims trailing slash", async () => {
    process.env.CRM_HTTP_BASE_URL = "https://my-crm.example.com/api/";
    process.env.CRM_HTTP_TOKEN = "secret123";
    const seen: { url: string; auth?: string }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.Authorization });
      return { ok: true, json: async () => [{ id: "c1", name: "Jordan", points: [] }] } as Response;
    }) as unknown as typeof fetch;

    const contacts = await new HttpCrmProvider().listContacts();
    expect(contacts).toHaveLength(1);
    expect(seen[0].url).toBe("https://my-crm.example.com/api/contacts"); // no double slash
    expect(seen[0].auth).toBe("Bearer secret123");
  });

  it("passes opportunity filters as query params", async () => {
    process.env.CRM_HTTP_BASE_URL = "https://crm.example.com";
    let url = "";
    global.fetch = vi.fn(async (u: string) => {
      url = String(u);
      return { ok: true, json: async () => [] } as Response;
    }) as unknown as typeof fetch;
    await new HttpCrmProvider().listOpportunities({ stageType: "open" });
    expect(url).toContain("/opportunities?");
    expect(url).toContain("stageType=open");
  });

  it("normalizes non-array list responses to []", async () => {
    process.env.CRM_HTTP_BASE_URL = "https://crm.example.com";
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ error: "oops" }) }) as Response) as unknown as typeof fetch;
    expect(await new HttpCrmProvider().listUsers()).toEqual([]);
  });

  it("throws a clear error on a non-OK response", async () => {
    process.env.CRM_HTTP_BASE_URL = "https://crm.example.com";
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(new HttpCrmProvider().listPipelines()).rejects.toThrow(/503/);
  });

  it("posts a new contact and returns the created record", async () => {
    process.env.CRM_HTTP_BASE_URL = "https://crm.example.com";
    let method = "";
    global.fetch = vi.fn(async (_u: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      return { ok: true, json: async () => ({ id: "new1", name: "Pat", points: [] }) } as Response;
    }) as unknown as typeof fetch;
    const c = await new HttpCrmProvider().createContact({ name: "Pat", points: [] });
    expect(method).toBe("POST");
    expect(c.id).toBe("new1");
  });
});
