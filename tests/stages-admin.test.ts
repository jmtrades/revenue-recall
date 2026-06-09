import { describe, it, expect } from "vitest";
import { POST as createStageRoute } from "@/app/api/stages/route";
import { PATCH as patchStageRoute, DELETE as deleteStageRoute } from "@/app/api/stages/[id]/route";

// Test env has no Supabase → the active provider is the built-in store, so every
// stage mutation must refuse with the "your CRM owns its pipeline" 409 rather
// than pretending to edit. (The Supabase paths are exercised in production; the
// org-scoping discipline is enforced in stages-admin.ts via pipeline_id ∈ org.)
function req(body?: unknown, method = "POST") {
  return new Request("http://x/api/stages", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("stage admin routes", () => {
  it("validates the create body (400 before any provider work)", async () => {
    expect((await createStageRoute(req({}))).status).toBe(400);
    expect((await createStageRoute(req({ label: "" }))).status).toBe(400);
    expect((await createStageRoute(req({ label: "Demo", probability: 7 }))).status).toBe(400);
  });

  it("refuses to create on a non-Supabase data source (409)", async () => {
    const res = await createStageRoute(req({ label: "Demo scheduled" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/CRM owns its pipeline/);
  });

  it("validates the patch body and refuses edits on a non-Supabase source", async () => {
    expect((await patchStageRoute(req({}, "PATCH"), { params: { id: "s1" } })).status).toBe(400);
    expect((await patchStageRoute(req({ probability: 2 }, "PATCH"), { params: { id: "s1" } })).status).toBe(400);
    expect((await patchStageRoute(req({ label: "Renamed" }, "PATCH"), { params: { id: "s1" } })).status).toBe(409);
    expect((await patchStageRoute(req({ direction: "up" }, "PATCH"), { params: { id: "s1" } })).status).toBe(409);
  });

  it("refuses delete on a non-Supabase source (409)", async () => {
    expect((await deleteStageRoute(req(undefined, "DELETE"), { params: { id: "s1" } })).status).toBe(409);
  });
});
