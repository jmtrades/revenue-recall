import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * RLS coverage guarantee (the database-layer counterpart to the code-layer
 * org-isolation tripwire).
 *
 * Every server query runs with the service-role key, which BYPASSES RLS — so
 * RLS is the *backstop* that catches a forgotten org filter the moment any path
 * connects as the authenticated user (the audit-log read already does; more
 * surfaces will follow). For that backstop to mean anything, every org-scoped
 * table must (a) have RLS enabled and (b) carry a live, membership-scoped
 * policy; and every write-capable policy must have a WITH CHECK clause, or a
 * session client could INSERT/UPDATE rows into another org.
 *
 * This test parses the migrations and enforces both, so a new org-scoped table
 * can't ship RLS-naked (the exact class of bug audit_log had before 0052).
 */

// The org-scoped tables (must match tests/org-isolation-tripwire.test.ts).
const ORG_SCOPED_TABLES = [
  "activities", "agent_outbox", "agent_runs", "agent_tasks", "ai_batches", "ai_usage",
  "audit_log", "booking_availability", "bookings", "connections", "contacts",
  "custom_automation_runs", "custom_automations", "custom_sequences", "custom_templates",
  "digest_runs", "invitations", "manual_tasks", "meeting_types", "members", "message_events",
  "opportunities", "orgs", "personas", "pipelines", "recall_events", "recall_snoozes",
  "sequence_enrollments", "stages", "subscriptions", "usage_credits",
];

// audit_log is intentionally SELECT-only at the policy level: writes are
// service-role-only (append-only trail), so its policy carries no WITH CHECK.
const WRITE_EXEMPT_TABLES = new Set(["audit_log"]);

interface Policy { table: string; name: string; command: string; hasCheck: boolean }

function loadMigrationSql(): string {
  const dir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

/** Parse migrations into the set of LIVE policies + RLS-enabled tables,
 *  honoring `drop policy` so superseded policies (e.g. the 0001 JWT-claim ones
 *  replaced in 0003) don't count. */
function parse(sql: string): { rlsTables: Set<string>; policies: Map<string, Policy> } {
  const noComments = sql.replace(/--[^\n]*/g, "");
  const statements = noComments.split(";");
  const rlsTables = new Set<string>();
  const policies = new Map<string, Policy>(); // key: `${table}:${name}`

  for (const raw of statements) {
    const s = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!s) continue;

    const rls = s.match(/^alter table (?:only )?([a-z_]+) enable row level security$/);
    if (rls) { rlsTables.add(rls[1]); continue; }

    const drop = s.match(/^drop policy if exists ([a-z_]+) on ([a-z_]+)/);
    if (drop) { policies.delete(`${drop[2]}:${drop[1]}`); continue; }

    const create = s.match(/^create policy ([a-z_]+) on ([a-z_]+)/);
    if (create) {
      const name = create[1];
      const table = create[2];
      const cmd = s.match(/\bfor (select|insert|update|delete|all)\b/);
      policies.set(`${table}:${name}`, {
        table,
        name,
        command: cmd ? cmd[1] : "all", // Postgres default is ALL
        hasCheck: /\bwith check\b/.test(s),
      });
    }
  }
  return { rlsTables, policies };
}

describe("RLS policy coverage across migrations", () => {
  const { rlsTables, policies } = parse(loadMigrationSql());
  const livePolicies = [...policies.values()];

  it("every org-scoped table has RLS enabled", () => {
    const missing = ORG_SCOPED_TABLES.filter((t) => !rlsTables.has(t));
    expect(missing, `Tables with org data but NO 'enable row level security': ${missing.join(", ")}`).toEqual([]);
  });

  it("every org-scoped table has at least one live policy", () => {
    const tablesWithPolicy = new Set(livePolicies.map((p) => p.table));
    const missing = ORG_SCOPED_TABLES.filter((t) => !tablesWithPolicy.has(t));
    expect(missing, `RLS-enabled but POLICY-less tables (deny-all to the session client — the audit_log<0052 bug): ${missing.join(", ")}`).toEqual([]);
  });

  it("every write-capable policy has a WITH CHECK clause (no cross-org INSERT/UPDATE)", () => {
    const offenders = livePolicies
      .filter((p) => (p.command === "insert" || p.command === "update" || p.command === "all"))
      .filter((p) => !p.hasCheck && !WRITE_EXEMPT_TABLES.has(p.table))
      .map((p) => `${p.table}.${p.name} (${p.command})`);
    expect(offenders, `Write-capable policies missing WITH CHECK — a session client could write rows into another org:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
