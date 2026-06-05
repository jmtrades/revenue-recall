import { listTasks } from "@/lib/agent/store";
import { enroll, listEnrollments } from "@/lib/cadence";
import { getOrgSettings } from "@/lib/org";
import { isAutomationEnabled } from "@/lib/automations";

/**
 * Speed-to-lead: the moment a brand-new lead arrives, start working it — don't
 * wait for the daily cron. A fresh inbound lead that sits for hours is a lost
 * lead; responding within minutes is the single biggest conversion lever in
 * outbound sales.
 *
 * This is opt-in by design: it only fires when the org has an enabled autopilot
 * task with the `on_new_lead` trigger, so a workspace that hasn't asked for
 * autonomous new-lead outreach is never surprised by it. When enabled, we
 * enroll the new contact into the "new_lead" speed-to-lead sequence whose first
 * step is day 0 — i.e. immediately due — so the next due-step run sends it.
 *
 * Best-effort and never throws: capturing the lead must succeed even if kicking
 * off outreach hiccups.
 */
export async function fireSpeedToLead(contactId: string): Promise<{ enrolled: boolean; reason?: string }> {
  if (!contactId) return { enrolled: false, reason: "no contact" };
  try {
    // Honor the org's Speed-to-Lead automation toggle as a master switch (default
    // on, so behavior is unchanged unless the org turns it off on the Automations
    // page). The on_new_lead autopilot task below still gates it too.
    const org = await getOrgSettings().catch(() => null);
    if (org && !isAutomationEnabled("speed_to_lead", org.automations)) return { enrolled: false, reason: "automation off" };
    const tasks = await listTasks();
    const wants = tasks.some((t) => t.enabled && t.trigger === "on_new_lead");
    if (!wants) return { enrolled: false, reason: "no on_new_lead task" };

    // Don't double-enroll a contact already in the speed-to-lead sequence.
    const active = await listEnrollments("active");
    if (active.some((e) => e.sequenceId === "new_lead" && e.contactId === contactId)) {
      return { enrolled: false, reason: "already enrolled" };
    }

    const res = await enroll("new_lead", `contact:${contactId}`);
    return { enrolled: res.enrolled > 0 };
  } catch {
    return { enrolled: false, reason: "error" };
  }
}
