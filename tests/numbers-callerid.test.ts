import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/numbers/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/numbers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("set_caller_id validates the number", () => {
  it("rejects a value that isn't a real phone number (400)", async () => {
    expect((await post({ action: "set_caller_id", number: "not a phone" })).status).toBe(400);
    expect((await post({ action: "set_caller_id", number: "=cmd" })).status).toBe(400);
    expect((await post({ action: "set_caller_id", number: "123" })).status).toBe(400); // too few digits
  });

  it("does not reject a valid international number as invalid", async () => {
    // Passes validation (a 502 is possible here only because persisting org
    // settings needs a connected DB in this test env — not a 400 rejection).
    const res = await post({ action: "set_caller_id", number: "+1 (555) 123-4567" });
    expect(res.status).not.toBe(400);
  });
});
