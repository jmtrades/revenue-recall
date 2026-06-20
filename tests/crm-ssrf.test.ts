import { describe, it, expect, afterEach } from "vitest";
import { PipedriveProvider } from "@/lib/crm/providers/pipedrive";
import { SalesforceProvider } from "@/lib/crm/providers/salesforce";
import { HttpCrmProvider } from "@/lib/crm/providers/http";

// The Salesforce instanceUrl / Pipedrive apiBase / HTTP-CRM base are tenant
// (or operator) connection config that flow straight into a server-side fetch.
// Without a guard, an internal address (cloud metadata, localhost, private
// ranges) would be fetched from inside the trust boundary and the response
// surfaced back — an authenticated SSRF with exfiltration. Each provider must
// refuse such a URL before making the request.

const INTERNAL = ["http://169.254.169.254/latest/meta-data/", "http://localhost:9000/x", "http://127.0.0.1/x", "http://10.0.0.5/x"];

describe("CRM providers block SSRF via tenant-supplied URLs", () => {
  it("Pipedrive refuses an internal apiBase", async () => {
    for (const base of INTERNAL) {
      const p = new PipedriveProvider({ token: "tok", base });
      await expect(p.listContacts(), base).rejects.toThrow();
    }
  });

  it("Salesforce refuses an internal instanceUrl", async () => {
    for (const instanceUrl of INTERNAL) {
      const p = new SalesforceProvider({ token: "tok", instanceUrl });
      await expect(p.listContacts(), instanceUrl).rejects.toThrow();
    }
  });

  it("HTTP CRM refuses an internal base", async () => {
    const original = process.env.CRM_HTTP_BASE_URL;
    try {
      for (const base of INTERNAL) {
        process.env.CRM_HTTP_BASE_URL = base;
        await expect(new HttpCrmProvider().listContacts(), base).rejects.toThrow();
      }
    } finally {
      if (original === undefined) delete process.env.CRM_HTTP_BASE_URL;
      else process.env.CRM_HTTP_BASE_URL = original;
    }
  });

  afterEach(() => {
    /* nothing global to reset beyond the per-test env restore above */
  });
});
