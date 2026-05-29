#!/usr/bin/env node
/**
 * Route smoke test. Boots the production server (`next start`) and asserts that
 * every key route renders server-side without a 5xx — the failure mode a build
 * can't catch (a bad data call, a server-only crash). Run after `npm run build`:
 *
 *   npm run build && npm run smoke
 *
 * Exits non-zero on the first bad route so it gates CI.
 */
import { spawn } from "node:child_process";

const PORT = process.env.SMOKE_PORT || "3210";
const BASE = `http://localhost:${PORT}`;

// Public + demo-accessible app routes (auth is off by default, so these render).
const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/onboarding",
  "/dashboard",
  "/pipeline",
  "/recall",
  "/leads",
  "/tasks",
  "/approvals",
  "/inbox",
  "/dialer",
  "/calendar",
  "/agents",
  "/sequences",
  "/templates",
  "/automations",
  "/reports",
  "/forecast",
  "/settings",
  "/api/health",
];

async function waitForReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Server did not become ready in time");
}

const server = spawn("npx", ["next", "start", "-p", PORT], {
  stdio: ["ignore", "inherit", "inherit"],
  env: process.env,
});

let failed = false;
try {
  await waitForReady();
  for (const path of ROUTES) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    const ok = res.status < 500;
    console.log(`${ok ? "✓" : "✗"} ${res.status}  ${path}`);
    if (!ok) failed = true;
  }
} catch (e) {
  console.error("smoke error:", e instanceof Error ? e.message : e);
  failed = true;
} finally {
  server.kill("SIGTERM");
}

if (failed) {
  console.error("\nSmoke test FAILED — a route returned 5xx.");
  process.exit(1);
}
console.log("\nSmoke test passed — every route renders.");
process.exit(0);
