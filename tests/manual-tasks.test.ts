import { describe, it, expect } from "vitest";
import { cleanTaskTitle, listManualTasks } from "@/lib/tasks/manual";

describe("cleanTaskTitle", () => {
  it("trims, collapses whitespace, and bounds length", () => {
    expect(cleanTaskTitle("  Call Pat  ")).toBe("Call Pat");
    expect(cleanTaskTitle("a\n\t  b")).toBe("a b");
    expect(cleanTaskTitle("x".repeat(300)).length).toBe(200);
  });
  it("returns empty for nothing usable (so the API rejects it)", () => {
    expect(cleanTaskTitle("   ")).toBe("");
    expect(cleanTaskTitle("")).toBe("");
  });
});

describe("listManualTasks (graceful degradation)", () => {
  it("returns [] with no database — so the Tasks page always renders", async () => {
    expect(await listManualTasks()).toEqual([]);
  });
});
