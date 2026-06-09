import { describe, it, expect } from "vitest";
import { POST as createRoute, PATCH as patchRoute, DELETE as deleteRoute } from "@/app/api/templates/route";
import { listCustomTemplates, allTemplatesFor } from "@/lib/templates-store";
import { templatesFor } from "@/lib/templates";

function req(body: unknown, method = "POST") {
  return new Request("http://x/api/templates", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// No Supabase in tests → reads degrade to presets-only; writes answer the
// honest "needs a connected database" 409. The org-scoping discipline lives in
// templates-store.ts (.eq("org_id", …) on every query).
describe("custom templates", () => {
  it("reads degrade gracefully without a database", async () => {
    expect(await listCustomTemplates()).toEqual([]);
    const merged = await allTemplatesFor("real_estate");
    expect(merged).toEqual(templatesFor("real_estate")); // presets only, nothing lost
  });

  it("create validates the body", async () => {
    expect((await createRoute(req({}))).status).toBe(400);
    expect((await createRoute(req({ name: "x", channel: "fax", body: "hi" }))).status).toBe(400);
    expect((await createRoute(req({ name: "x", channel: "email", body: "" }))).status).toBe(400);
  });

  it("writes answer 409 without a database (not a 500)", async () => {
    const res = await createRoute(req({ name: "Win-back", channel: "email", body: "Hi {{first_name}}" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/database/i);
    expect((await patchRoute(req({ id: "t1", name: "Renamed" }, "PATCH"))).status).toBe(409);
    expect((await deleteRoute(req({ id: "t1" }, "DELETE"))).status).toBe(409);
  });

  it("patch requires at least one field", async () => {
    expect((await patchRoute(req({ id: "t1" }, "PATCH"))).status).toBe(400);
  });
});
