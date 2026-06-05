import { describe, it, expect } from "vitest";
import { isAutomationEnabled, effectiveAutomations } from "@/lib/automations";
import { GET, POST } from "@/app/api/automations/route";

describe("automation enable resolution", () => {
  it("uses the org override, else the template default", () => {
    expect(isAutomationEnabled("speed_to_lead", undefined)).toBe(true); // default on
    expect(isAutomationEnabled("speed_to_lead", { speed_to_lead: false })).toBe(false);
    expect(isAutomationEnabled("won_onboarding", undefined)).toBe(false); // default off
    expect(isAutomationEnabled("won_onboarding", { won_onboarding: true })).toBe(true);
    expect(isAutomationEnabled("nope", undefined)).toBe(false);
  });

  it("effectiveAutomations applies overrides to the listed enabled state", () => {
    const list = effectiveAutomations("generic", { speed_to_lead: false, idle_recall: true });
    expect(list.find((a) => a.id === "speed_to_lead")?.enabled).toBe(false);
    expect(list.find((a) => a.id === "idle_recall")?.enabled).toBe(true);
  });
});

describe("/api/automations", () => {
  const post = (body: unknown) =>
    POST(new Request("http://x/api/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("GET returns the org's automations", async () => {
    const res = await GET(new Request("http://x/api/automations"));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).automations)).toBe(true);
  });

  it("POST validates the body and the automation id", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ id: "does-not-exist", enabled: true })).status).toBe(404);
    // A valid toggle reaches persistence — 502 here only because this test env has
    // no DB to persist to (NOT a 400/404 validation rejection).
    expect([200, 502]).toContain((await post({ id: "speed_to_lead", enabled: false })).status);
  });
});
