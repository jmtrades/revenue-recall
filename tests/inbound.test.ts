import { describe, it, expect, beforeEach } from "vitest";
import { handleInbound } from "@/lib/inbound";
import { parseRetryTask } from "@/lib/calls";
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

  it("confirms a booked callback with the exact time, not an AI guess", async () => {
    const { listOutbox } = await import("@/lib/agent/store");
    const p = getProvider();
    const c = await p.createContact({ name: "Confirm Me", points: [{ channel: "phone", value: "+1 (555) 010-6611" }] });

    const res = await handleInbound("sms", "+1 (555) 010-6611", "swamped — call me tomorrow at 2pm");
    expect(res.matched).toBe(true);
    expect(res.contactId).toBe(c.id);
    expect(res.action).toBe("queued"); // REPLY_AUTOPILOT off → Approvals

    const pending = await listOutbox("pending");
    const confirmation = pending.find((o) => o.contactId === c.id && o.channel === "sms");
    expect(confirmation).toBeTruthy();
    expect(confirmation!.body).toContain("I'll call you");
    expect(confirmation!.body).toContain("2:00 PM"); // reads back THEIR exact time
  });

  it("reschedules when they reply with just a new time — the confirmation's promise is real", async () => {
    const { listOutbox } = await import("@/lib/agent/store");
    const p = getProvider();
    const c = await p.createContact({ name: "Move It", points: [{ channel: "phone", value: "+1 (555) 010-7755" }] });

    // First message books 2pm; the confirmation says "reply with a time and I'll move it".
    await handleInbound("sms", "+1 (555) 010-7755", "busy day — call me tomorrow at 2pm");
    // The reply names ONLY a time: no call-phrase, no busy phrasing. The pending
    // callback is what arms the parser.
    await handleInbound("sms", "+1 (555) 010-7755", "actually tomorrow at 4pm works better");

    const acts = await p.listActivitiesByContact!(c.id);
    const tasks = acts.filter((a) => a.kind === "task" && a.summary.includes("asked for a callback"));
    expect(tasks.length).toBe(2); // the runner executes the newest, superseding 2pm
    const expected = Date.parse(`${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T16:00:00Z`);
    const dues = tasks.map((t) => Date.parse(parseRetryTask(t.summary)!.dueAt));
    expect(dues.some((d) => Math.abs(d - expected) < 60_000)).toBe(true);

    const pending = await listOutbox("pending");
    const confirmations = pending.filter((o) => o.contactId === c.id && o.channel === "sms" && o.body.includes("I'll call you"));
    expect(confirmations.some((o) => o.body.includes("4:00 PM"))).toBe(true);
  });

  it("BOOKS the dial when a busy reply names a time — not just a sticky note", async () => {
    // The 555 test number carries no timezone and the test org sets none →
    // times parse in UTC, so "tomorrow at 3" is tomorrow 15:00Z exactly.
    const res = await handleInbound("sms", "+1 (555) 010-4477", "in a meeting — call me tomorrow at 3");
    expect(res.intent).toBe("busy");
    expect(res.messageTaken).toBe(true);

    const acts = await getProvider().listRecentActivities(50);
    const task = acts.find((a) => a.contactId === res.contactId && a.kind === "task" && a.summary.includes("asked for a callback"));
    expect(task, "the callback should be booked as a machine-executable retry task").toBeTruthy();
    const parsed = parseRetryTask(task!.summary);
    expect(parsed).toBeTruthy();
    const expected = Date.parse(`${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T15:00:00Z`);
    expect(Math.abs(Date.parse(parsed!.dueAt) - expected)).toBeLessThan(60_000);
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

  it("breaks auto-reply loops: a 2nd auto-reply within the cooldown is queued, not auto-sent", async () => {
    process.env.REPLY_AUTOPILOT = "true";
    try {
      const phone = "+1 (555) 909-1212";
      await handleInbound("sms", phone, "hi"); // first message creates the contact (no auto-reply on the new-contact path)
      const first = await handleInbound("sms", phone, "tell me more about what you offer");
      expect(first.action).not.toBe("queued"); // matched → auto-sent (logged: no live transport in tests)
      const second = await handleInbound("sms", phone, "and how does onboarding work");
      expect(second.action).toBe("queued"); // cooldown loop-breaker hands it to a human instead
    } finally {
      delete process.env.REPLY_AUTOPILOT;
    }
  });
});
