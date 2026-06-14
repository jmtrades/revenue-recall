import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Org-isolation tripwire.
 *
 * Every server-side Supabase query in this app runs with the SERVICE-ROLE key,
 * which BYPASSES Row-Level Security — tenant isolation rests entirely on each
 * query filtering by the right org (`.eq("org_id", …)` or an org-scoped FK
 * chain). One missed filter in one new file is a cross-tenant data leak with no
 * backstop.
 *
 * Until queries move onto an RLS-enforced client (the planned fix), this test
 * is the guardrail: it inventories every file that touches an org-scoped table
 * and fails CI the moment a file NOT on the audited list below starts querying
 * one. That forces the question "does every query in this new file scope to the
 * caller's org?" to be answered at review time, deliberately, instead of never.
 *
 * If this test fails because you added a file:
 *   1. Audit EVERY query in it: each read/write of a table listed here must be
 *      constrained to the authenticated org (directly via org_id, or through a
 *      parent row you already org-checked).
 *   2. Then — and only then — add the file to AUDITED_FILES.
 * If it fails because a file stopped touching org tables, remove the stale
 * entry so the list stays exact.
 */

// Tables that carry tenant data: everything with an org_id column in
// supabase/migrations, plus `stages` (org-scoped via its pipeline FK) and
// `orgs` itself (the tenant root). Platform tables (cron_locks, rate_limits,
// inbound_events) are intentionally absent — they hold no tenant rows.
const ORG_SCOPED_TABLES = new Set([
  "activities",
  "agent_outbox",
  "agent_runs",
  "agent_tasks",
  "ai_batches",
  "ai_usage",
  "audit_log",
  "booking_availability",
  "bookings",
  "connections",
  "contacts",
  "custom_automation_runs",
  "custom_automations",
  "custom_sequences",
  "custom_templates",
  "digest_runs",
  "invitations",
  "manual_tasks",
  "meeting_types",
  "members",
  "message_events",
  "opportunities",
  "orgs",
  "personas",
  "pipelines",
  "recall_events",
  "recall_snoozes",
  "sequence_enrollments",
  "stages",
  "subscriptions",
  "usage_credits",
]);

// Files audited to scope every org-table query to the caller's org.
const AUDITED_FILES = new Set([
  "src/app/api/agent/cron/route.ts",
  "src/app/api/user/delete/route.ts",
  "src/lib/agent/store.ts",
  "src/lib/ai/batch.ts",
  "src/lib/ai/usage.ts",
  "src/lib/api-keys-server.ts",
  "src/lib/audit.ts",
  "src/lib/authz.ts",
  "src/lib/automations/custom-store.ts",
  "src/lib/billing/lifecycle.ts",
  "src/lib/billing/reconcile.ts",
  "src/lib/billing/store.ts",
  "src/lib/cadence.ts",
  "src/lib/calls/recordings.ts",
  "src/lib/connections/store.ts",
  "src/lib/crm/providers/supabase.ts",
  "src/lib/digest.ts",
  "src/lib/invites-server.ts",
  "src/lib/meetings/stats.ts",
  "src/lib/meetings/store.ts",
  "src/lib/members-server.ts",
  "src/lib/org.ts",
  "src/lib/platform-pulse.ts",
  "src/lib/recall/events.ts",
  "src/lib/recall/snooze.ts",
  "src/lib/sequences-store.ts",
  "src/lib/stages-admin.ts",
  "src/lib/supabase/bootstrap.ts",
  "src/lib/supabase/provision.ts",
  "src/lib/supabase/tenant.ts",
  "src/lib/tasks/manual.ts",
  "src/lib/templates-store.ts",
  "src/lib/tracking.ts",
  "src/lib/voice.ts",
  "src/lib/webhooks-out.ts",
]);

const FROM_CALL = /\.from\(\s*"([a-z_]+)"\s*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function filesTouchingOrgTables(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    const tables = new Set<string>();
    for (const m of text.matchAll(FROM_CALL)) if (ORG_SCOPED_TABLES.has(m[1])) tables.add(m[1]);
    if (tables.size > 0) hits.set(file.replace(/\\/g, "/"), [...tables].sort());
  }
  return hits;
}

describe("org-isolation tripwire (service-role queries bypass RLS)", () => {
  const actual = filesTouchingOrgTables();

  it("no UNAUDITED file queries an org-scoped table", () => {
    const unaudited = [...actual.entries()].filter(([file]) => !AUDITED_FILES.has(file));
    const detail = unaudited.map(([file, tables]) => `  ${file} → ${tables.join(", ")}`).join("\n");
    expect.soft(unaudited, `New org-table access outside the audited list — audit every query for org scoping, then add the file:\n${detail}`).toEqual([]);
  });

  it("the audited list carries no stale entries", () => {
    const stale = [...AUDITED_FILES].filter((file) => !actual.has(file));
    expect(stale, "These audited files no longer touch org tables — remove them so the list stays exact").toEqual([]);
  });
});
