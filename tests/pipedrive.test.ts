import { describe, it, expect, afterEach } from "vitest";
import { PipedriveProvider, pdTime, pdRefId, pipedriveStages, pipedriveDealStageId } from "@/lib/crm/providers/pipedrive";

describe("pdTime", () => {
  it("normalizes Pipedrive UTC timestamps to ISO", () => {
    expect(pdTime("2026-01-15 09:30:00")).toBe("2026-01-15T09:30:00Z");
    expect(pdTime("2026-01-15")).toBe("2026-01-15T00:00:00Z"); // date-only
  });
  it("passes through ISO and handles empty", () => {
    expect(pdTime("2026-01-15T09:30:00Z")).toBe("2026-01-15T09:30:00Z");
    expect(pdTime(null)).toBeUndefined();
    expect(pdTime(undefined)).toBeUndefined();
  });
});

describe("pdRefId", () => {
  it("reads an id from an object, a bare number, or nullish", () => {
    expect(pdRefId({ value: 42 })).toBe("42");
    expect(pdRefId(7)).toBe("7");
    expect(pdRefId(null)).toBe("");
    expect(pdRefId({})).toBe("");
  });
});

describe("pipedriveStages", () => {
  it("orders open stages and appends synthetic Won/Lost", () => {
    const stages = pipedriveStages(
      [
        { id: 2, name: "Demo", pipeline_id: 1, order_nr: 2, deal_probability: 50 },
        { id: 1, name: "Lead In", pipeline_id: 1, order_nr: 1, deal_probability: 10 },
      ],
      "1",
    );
    expect(stages.map((s) => s.label)).toEqual(["Lead In", "Demo", "Won", "Lost"]);
    expect(stages.map((s) => s.type)).toEqual(["open", "open", "won", "lost"]);
    expect(stages[0].probability).toBe(0.1);
    expect(stages[1].probability).toBe(0.5);
    expect(stages[2].id).toBe("1:won");
    expect(stages[3].id).toBe("1:lost");
  });

  it("defaults a missing probability to 0.5", () => {
    const [s] = pipedriveStages([{ id: 1, name: "X", pipeline_id: 9, deal_probability: null }], "9");
    expect(s.probability).toBe(0.5);
  });
});

describe("pipedriveDealStageId", () => {
  it("routes won/lost deals to the synthetic stage, else the real stage", () => {
    expect(pipedriveDealStageId("won", 5, "1")).toBe("1:won");
    expect(pipedriveDealStageId("lost", 5, "1")).toBe("1:lost");
    expect(pipedriveDealStageId("open", 5, "1")).toBe("5");
    expect(pipedriveDealStageId(undefined, undefined, "1")).toBe("");
  });
});

describe("PipedriveProvider readiness", () => {
  const original = process.env.PIPEDRIVE_API_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.PIPEDRIVE_API_TOKEN;
    else process.env.PIPEDRIVE_API_TOKEN = original;
  });

  it("is not ready without a token, ready with one", () => {
    delete process.env.PIPEDRIVE_API_TOKEN;
    expect(new PipedriveProvider().info().ready).toBe(false);
    process.env.PIPEDRIVE_API_TOKEN = "pd-test";
    const info = new PipedriveProvider().info();
    expect(info.ready).toBe(true);
    expect(info.id).toBe("pipedrive");
    expect(info.capabilities.write).toBe(true);
  });
});
