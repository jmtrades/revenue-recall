import { describe, it, expect, vi, beforeEach } from "vitest";

const { setContactStatus } = vi.hoisted(() => ({ setContactStatus: vi.fn(async () => "working") }));
vi.mock("@/lib/leads", () => ({ setContactStatus }));

import { POST } from "@/app/api/contacts/bulk/route";

const post = (body: unknown) =>
  new Request("http://localhost/api/contacts/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  setContactStatus.mockResolvedValue("working");
});

describe("bulk lead status", () => {
  it("rejects an empty id list or an invalid status", async () => {
    expect((await POST(post({ ids: [], status: "working" }))).status).toBe(400);
    expect((await POST(post({ ids: ["a"], status: "nope" }))).status).toBe(400);
  });

  it("applies the status to every id and reports the count", async () => {
    const res = await POST(post({ ids: ["a", "b", "c"], status: "working" }));
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(3);
    expect(setContactStatus).toHaveBeenCalledTimes(3);
  });

  it("skips ids that fail and still reports the rest", async () => {
    setContactStatus.mockResolvedValueOnce("working").mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce("working");
    const res = await POST(post({ ids: ["a", "b", "c"], status: "working" }));
    expect((await res.json()).updated).toBe(2);
  });
});
