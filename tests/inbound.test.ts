import { describe, it, expect, beforeEach } from "vitest";
import { handleInbound } from "@/lib/inbound";
import { getProvider } from "@/lib/crm/registry";
import { createTask } from "@/lib/agent/store";
import { listEnrollments } from "@/lib/cadence";

// Uses the built-in (in-memory) provider. No AI key, so replies use the human
// template fallback and REPLY_AUTOPILOT stays off (queued to Approvals).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REPLY_AUTOPILOT;
});

describe("inbound message handling", () => {
  it("takes a message from an unknown sender: creates a contact, logs it, raises a follow-up", async () => {
    const before = (await getProvider().listContacts()).length;
    const res = await handleInbound("sms", "+1 (555) 010-2929", "hey, saw your listing, call me back");
    expect(res.action).toBe("logged");
    expect(res.messageTaken).toBe(true);
    expect(res.contactId).toBeTruthy();

    const after = await getProvider().listContacts();
    expect(after.length).toBe(before + 1);
    const created = after.find((c) => c.id === res.contactId)!;
    expect(created.points.some((p) => p.value.includes("2929"))).toBe(true);

    // The follow-up task was raised on the org's recent activity feed.
    const recent = await getProvider().listRecentActivities(20);
    expect(recent.some((a) => a.kind === "task" && a.contactId === created.id)).toBe(true);
  });

  it("matches a known contact, logs the inbound, and queues a reply", async () => {
    const contacts = await getProvider().listContacts();
    const withEmail = contacts.find((c) => c.points.some((p) => p.channel === "email"));
    expect(withEmail).toBeTruthy();
    const email = withEmail!.points.find((p) => p.channel === "email")!.value;

    const res = await handleInbound("email", email, "How much does this cost?", "Re: your note");
    expect(res.matched).toBe(true);
    expect(res.contactId).toBe(withEmail!.id);
    expect(res.action).toBe("queued");
    expect(res.intent).toBe("price");
  });

  it("takes a message when the contact is unavailable (busy)", async () => {
    const contacts = await getProvider().listContacts();
    const withEmail = contacts.find((c) => c.points.some((p) => p.channel === "email"))!;
    const email = withEmail.points.find((p) => p.channel === "email")!.value;

    const res = await handleInbound("email", email, "can't talk right now, call me back later");
    expect(res.matched).toBe(true);
    expect(res.intent).toBe("busy");
    expect(res.messageTaken).toBe(true);
  });

  // NOTE: these two share the process-level agent-task + enrollment stores, so
  // the opt-OUT case runs first (clean store, no on_new_lead task) and the
  // opt-IN case creates the task that turns the feature on.
  it("does NOT enroll new leads when no on_new_lead task exists (opt-in default off)", async () => {
    const res = await handleInbound("sms", "+1 (555) 818-3030", "hello there");
    const enrollments = await listEnrollments("active");
    expect(enrollments.some((e) => e.sequenceId === "new_lead" && e.contactId === res.contactId)).toBe(false);
  });

  it("speed-to-lead: enrolls a brand-new inbound lead when on_new_lead autopilot is on", async () => {
    // Opt in: an enabled on_new_lead task is the switch that turns this on.
    await createTask({ name: "Speed to lead", goal: "Reach new leads fast.", trigger: "on_new_lead", scope: "all_open", channel: "sms", autonomy: "auto" });

    const res = await handleInbound("sms", "+1 (555) 717-2020", "saw your ad, interested!");
    expect(res.contactId).toBeTruthy();

    const enrollments = await listEnrollments("active");
    const mine = enrollments.find((e) => e.sequenceId === "new_lead" && e.contactId === res.contactId);
    expect(mine).toBeTruthy(); // the new lead is being worked immediately, not next cron
  });
});
