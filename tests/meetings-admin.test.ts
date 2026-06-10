import { describe, it, expect, vi, beforeEach } from "vitest";
import { slugify } from "@/lib/meetings/slug";

/**
 * Scheduling admin: slug derivation + the /api/meetings/* routes. The store is
 * mocked to capture what the routes persist; requireRole no-ops without enforced
 * auth (no DB in tests), so we exercise validation + normalization directly.
 */

const h = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  saved: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/meetings/store", () => ({
  createMeetingType: vi.fn(async (input: Record<string, unknown>) => {
    h.created.push(input);
    return { id: "mt_x", enabled: true, ...input };
  }),
  updateMeetingType: vi.fn(async () => undefined),
  deleteMeetingType: vi.fn(async () => undefined),
  saveAvailability: vi.fn(async (a: Record<string, unknown>) => {
    h.saved.push(a);
  }),
}));

import { POST as createType, PATCH as patchType, DELETE as deleteType } from "@/app/api/meetings/types/route";
import { PUT as putAvailability } from "@/app/api/meetings/availability/route";
import { _resetRateLimit } from "@/lib/ratelimit";

function req(body: unknown): Request {
  return new Request("http://x/api/meetings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  h.created = [];
  h.saved = [];
  _resetRateLimit();
});

describe("slugify", () => {
  it("makes URL-safe slugs and never returns empty", () => {
    expect(slugify("Intro Call")).toBe("intro-call");
    expect(slugify("  Demo / Q&A!! ")).toBe("demo-q-a");
    expect(slugify("15-min ☎ chat")).toBe("15-min-chat");
    expect(slugify("!!!")).toBe("meeting");
  });
});

describe("POST /api/meetings/types", () => {
  it("creates a type and derives the slug from the name", async () => {
    const res = await createType(req({ name: "Intro Call", durationMinutes: 30, locationKind: "video" }));
    expect(res.status).toBe(201);
    expect(h.created).toHaveLength(1);
    expect(h.created[0].slug).toBe("intro-call");
    expect(h.created[0].durationMinutes).toBe(30);
  });

  it("rejects an empty name or out-of-range duration (400)", async () => {
    expect((await createType(req({ name: "", durationMinutes: 30 }))).status).toBe(400);
    expect((await createType(req({ name: "X", durationMinutes: 1 }))).status).toBe(400);
    expect(h.created).toHaveLength(0);
  });
});

describe("PATCH/DELETE /api/meetings/types", () => {
  it("requires at least one field beyond id to patch", async () => {
    expect((await patchType(req({ id: "mt_1" }))).status).toBe(400);
    expect((await patchType(req({ id: "mt_1", enabled: false }))).status).toBe(200);
  });

  it("deletes by id, rejects a missing id", async () => {
    expect((await deleteType(req({ id: "mt_1" }))).status).toBe(200);
    expect((await deleteType(req({}))).status).toBe(400);
  });
});

describe("PUT /api/meetings/availability", () => {
  it("saves, normalizing weekday keys and dropping inverted / out-of-range windows", async () => {
    const res = await putAvailability(
      new Request("http://x/api/meetings/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timezone: "America/New_York",
          weekly: {
            "1": [{ start: "09:00", end: "17:00" }], // kept
            "2": [{ start: "18:00", end: "09:00" }], // inverted → dropped
            "9": [{ start: "09:00", end: "10:00" }], // bad weekday → dropped
          },
          slotMinutes: 30,
          minNoticeMinutes: 0,
          horizonDays: 14,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(h.saved).toHaveLength(1);
    const saved = h.saved[0] as { weekly: Record<string, unknown>; timezone: string };
    expect(Object.keys(saved.weekly)).toEqual(["1"]);
    expect(saved.timezone).toBe("America/New_York");
  });

  it("rejects an unrecognized timezone (400)", async () => {
    const res = await putAvailability(
      new Request("http://x/api/meetings/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: "Not/AZone", slotMinutes: 30, minNoticeMinutes: 0, horizonDays: 14 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(h.saved).toHaveLength(0);
  });

  it("rejects a malformed time (400)", async () => {
    const res = await putAvailability(
      new Request("http://x/api/meetings/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekly: { "1": [{ start: "25:00", end: "26:00" }] }, slotMinutes: 30, minNoticeMinutes: 0, horizonDays: 14 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
