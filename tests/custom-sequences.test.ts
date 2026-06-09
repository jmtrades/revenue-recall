import { describe, it, expect } from "vitest";
import { POST as createRoute, PATCH as patchRoute, DELETE as deleteRoute } from "@/app/api/sequences/manage/route";
import { listCustomSequences, allSequencesFor, resolveSequence } from "@/lib/sequences-store";
import { sequencesFor, getSequence } from "@/lib/sequences";

function req(body: unknown, method = "POST") {
  return new Request("http://x/api/sequences/manage", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// No Supabase in tests → reads degrade to presets-only; writes answer the
// honest "needs a connected database" 409.
describe("custom sequences", () => {
  it("reads degrade gracefully without a database", async () => {
    expect(await listCustomSequences()).toEqual([]);
    expect(await allSequencesFor("real_estate")).toEqual(sequencesFor("real_estate"));
  });

  it("resolveSequence finds presets and misses unknown ids", async () => {
    expect((await resolveSequence("recall"))?.id).toBe("recall"); // preset slug
    expect(await resolveSequence("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    expect(getSequence("recall")?.id).toBe("recall"); // sync preset lookup intact
  });

  it("create validates name + steps", async () => {
    expect((await createRoute(req({}))).status).toBe(400);
    expect((await createRoute(req({ name: "X", steps: [] }))).status).toBe(400);
    expect((await createRoute(req({ name: "X", steps: [{ day: -1, channel: "email", body: "hi" }] }))).status).toBe(400);
    expect((await createRoute(req({ name: "X", steps: [{ day: 0, channel: "fax", body: "hi" }] }))).status).toBe(400);
  });

  it("writes answer 409 without a database (not a 500)", async () => {
    const res = await createRoute(req({ name: "Post-demo", steps: [{ day: 0, channel: "email", subject: "thanks", body: "Recap + next step" }] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/database/i);
    expect((await patchRoute(req({ id: "s1", name: "Renamed" }, "PATCH"))).status).toBe(409);
    expect((await deleteRoute(req({ id: "s1" }, "DELETE"))).status).toBe(409);
  });
});
