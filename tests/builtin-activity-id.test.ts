import { describe, it, expect } from "vitest";
import { getProvider } from "@/lib/crm/registry";

describe("builtin logActivity ids are collision-free", () => {
  it("generates distinct ids for a same-millisecond burst", async () => {
    const provider = getProvider();
    // Fire a burst synchronously: with the old `a_${Date.now()}` scheme every
    // id in the same millisecond collided. newId()'s monotonic counter fixes it.
    const ids = await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        provider
          .logActivity({ contactId: "c_burst", kind: "note", summary: `burst ${i}`, occurredAt: new Date().toISOString() })
          .then((a) => a.id),
      ),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
