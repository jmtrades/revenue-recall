import { describe, it, expect, afterEach } from "vitest";
import { POST as cronRoute } from "@/app/api/agent/cron/route";
import { productionConfigIssues } from "@/lib/env-check";

const env = process.env as Record<string, string | undefined>;
const prevEnv = process.env.NODE_ENV;

afterEach(() => {
  env.NODE_ENV = prevEnv;
  delete env.CRON_SECRET;
});

describe("production cron auth fails closed", () => {
  it("rejects the spoofable x-vercel-cron header when no CRON_SECRET is set in production", async () => {
    env.NODE_ENV = "production";
    delete env.CRON_SECRET;
    const res = await cronRoute(new Request("http://localhost/api/agent/cron", { method: "POST", headers: { "x-vercel-cron": "1" } }));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer when a secret IS set", async () => {
    env.CRON_SECRET = "s3cret";
    const res = await cronRoute(new Request("http://localhost/api/agent/cron", { method: "POST", headers: { authorization: "Bearer nope", "x-vercel-cron": "1" } }));
    expect(res.status).toBe(401);
  });
});

describe("productionConfigIssues — silent fail-closed paths become named issues", () => {
  it("flags a missing CRON_SECRET as a launch blocker in production", () => {
    env.NODE_ENV = "production";
    delete env.CRON_SECRET;
    const audit = productionConfigIssues();
    expect(audit.blockers.some((b) => b.includes("CRON_SECRET"))).toBe(true);
  });

  it("is silent outside production", () => {
    env.NODE_ENV = "test";
    const audit = productionConfigIssues();
    expect(audit.blockers).toEqual([]);
    expect(audit.warnings).toEqual([]);
  });
});
