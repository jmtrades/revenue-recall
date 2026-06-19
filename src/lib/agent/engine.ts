import { resolveProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { getIndustry } from "@/lib/industries";
import { buildRecallQueue } from "@/lib/recall/engine";
import { draftMessage } from "@/lib/ai/draft";
import { isAiConfigured } from "@/lib/ai/client";
import { sendEmail, sendSms, placeCall, sendOutcome } from "@/lib/comms";
import { signCallMeta } from "@/lib/calls/meta-sig";
import { trackLinks, recordSent } from "@/lib/tracking";
import { sendGate, dailySendCap, containsUnverifiedClaim, hasCallConsent, hasSmsConsent, type SkipReason } from "@/lib/agent/guardrails";
import { complianceConfig, emailDomainVerified, smsA2pRegistered } from "@/lib/compliance";
import { isEmailBounced } from "@/lib/bounce";
import { outsideCourtesyWindow } from "@/lib/calls/local-time";
import { compactMoney } from "@/lib/format";
import { createRun, createOutboxItem, touchTask } from "@/lib/agent/store";
import { batchActivities } from "@/lib/crm/activities";
import { contactInsights, reachHint } from "@/lib/insights";
import { contactPreferredLanguage } from "@/lib/languages";
import { isEntitled, enforcementOn } from "@/lib/billing/enforce";
import { isWithinVoiceMinutes } from "@/lib/billing/voice-minutes";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { recordRecallTouch } from "@/lib/recall/events";
import type { AgentAction, AgentRun, AgentTask } from "@/lib/agent/types";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";

const SKIP_LABEL: Record<NonNullable<SkipReason>, string> = {
  opted_out: "Skipped — they opted out / asked us to stop.",
  recently_declined: "Held — soft 'no for now'; will re-engage after the cooldown.",
  recently_contacted: "Skipped — already contacted recently (cooldown).",
  quiet_hours: "Held — outside sending hours, will retry next run.",
  daily_cap: "Held — daily send cap reached.",
};

const MAX_ITEMS = 8;

interface Target {
  opp: Opportunity;
  reason?: string;
  recommendation?: string;
  days?: number;
  recoverable: number;
}

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

async function resolveTargets(task: AgentTask, pipelines: Pipeline[], opps: Opportunity[]): Promise<Target[]> {
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));

  if (task.scope === "recall_queue") {
    const items = buildRecallQueue(opps, pipelines).slice(0, MAX_ITEMS);
    return items
      .map((r): Target | null => {
        const opp = opps.find((o) => o.id === r.opportunityId);
        return opp ? { opp, reason: r.reason, recommendation: r.recommendation, days: r.daysSinceActivity, recoverable: r.weightedValue } : null;
      })
      .filter((t): t is Target => t !== null);
  }
  if (task.scope === "all_open") {
    return opps.filter((o) => stageById.get(o.stageId)?.type === "open").slice(0, MAX_ITEMS).map((opp) => ({ opp, recoverable: 0 }));
  }
  if (task.scope.startsWith("stage:")) {
    const sid = task.scope.slice(6);
    return opps.filter((o) => o.stageId === sid).slice(0, MAX_ITEMS).map((opp) => ({ opp, recoverable: 0 }));
  }
  if (task.scope.startsWith("deal:")) {
    const opp = opps.find((o) => o.id === task.scope.slice(5));
    return opp ? [{ opp, recoverable: 0 }] : [];
  }
  return [];
}

/** Execute one Autopilot task: the AI works each target per the task's goal,
 *  drafting (review) or sending (auto), and the whole run is logged to the ledger. */
export async function runTask(task: AgentTask): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const provider = (await resolveProvider());

  try {
    const [pipelines, opps, contacts, org, voice] = await Promise.all([
      provider.listPipelines(),
      provider.listOpportunities(),
      provider.listContacts(),
      getOrgSettings(),
      getActiveVoice(),
    ]);
    const contactById = new Map<string, Contact>(contacts.map((c) => [c.id, c]));
    const industry = getIndustry(org.industryId);
    const targets = await resolveTargets(task, pipelines, opps);
    // Prefetch every target's activities in one batch (avoids N+1 in the loop).
    const actByOpp = await batchActivities(provider, targets.map((t) => t.opp.id));

    // Effective autonomy, computed once. Two things force review (draft-to-
    // Approvals, never auto-send): a plan without the autopilot entitlement, and
    // the org's global "pause all sending" kill switch — the panic brake that
    // instantly stops every autonomous send without disabling anything else.
    const autopilotAllowed = await isEntitled("autopilot");
    const autonomy: AgentTask["autonomy"] =
      task.autonomy === "auto" && (!autopilotAllowed || org.sendingPaused) ? "review" : task.autonomy;

    const actions: AgentAction[] = [];
    const pending: { dealId: string; contactId: string; channel: "email" | "sms"; subject?: string; body: string; source: "ai" | "template"; recall: boolean }[] = [];
    let recoverable = 0;
    // Seed the send counter with the org's recent (rolling 24h) outbound sends so
    // the daily cap is enforced across runs, not reset every (hourly) cron tick —
    // otherwise "max 50/day" silently became "max 50 per run". Skip the query
    // entirely when no cap is configured (the default), so behavior is unchanged.
    let sent = 0;
    if (Number.isFinite(dailySendCap())) {
      const dayAgo = Date.now() - 86_400_000;
      const recent = await provider.listRecentActivities(500).catch(() => []);
      sent = recent.filter((a) => a.direction === "outbound" && ["email", "sms", "call"].includes(a.kind) && new Date(a.occurredAt).getTime() >= dayAgo).length;
    }
    let drafted = 0;
    // Autonomous-send compliance prerequisites, evaluated once per run:
    //  • Email: CAN-SPAM postal address AND a verified sending domain (operator
    //    attests SPF/DKIM/DMARC) — else hold for review, never blast from an
    //    unauthenticated domain.
    //  • SMS: A2P 10DLC registered (operator attestation) — on top of the
    //    per-contact consent check below.
    // The OUTBOUND_COMPLIANCE master switch (cc.enabled) turns all of this off.
    const cc = complianceConfig({ address: org.compliance.address });
    const emailReady = !cc.enabled || (Boolean(cc.address) && emailDomainVerified());
    const smsPlatformReady = !cc.enabled || smsA2pRegistered();
    // Voice-minute margin gate: every connected autonomous minute has real COGS,
    // so when billing enforcement is on, autopilot stops auto-dialing once the
    // plan's included minutes are used up — the same gate the manual dialer
    // honors (calls/place). NOT keyed on task.channel: auto mode can fall back to
    // a CALL for an email/SMS task when only a phone is on file (see the channel
    // fallback below), so this is checked once per run whenever enforcement is on.
    const voiceMinutesOk = !enforcementOn() || (await isWithinVoiceMinutes());

    for (const t of targets) {
      recoverable += t.recoverable;
      const contact = contactById.get(t.opp.contactId);
      const name = contact?.name ?? t.opp.title;

      if (task.channel === "none") {
        actions.push({
          type: "recommend",
          dealId: t.opp.id,
          title: name,
          detail: t.recommendation ?? task.goal,
          result: "queued",
          source: "template",
          value: t.recoverable,
        });
        continue;
      }

      // Guardrails: never message someone who opted out; in auto mode also respect
      // cooldown, quiet hours, and the daily cap. Checked before drafting to save cost.
      const activities = actByOpp.get(t.opp.id) ?? [];
      const gate = sendGate({ contact, opp: t.opp, activities, autonomy, sentSoFar: sent, timezone: org.timezone });
      if (gate) {
        actions.push({ type: task.channel, dealId: t.opp.id, title: name, detail: SKIP_LABEL[gate], result: "skipped", source: "template", value: t.recoverable });
        continue;
      }

      // What we know about reaching this person (channel they reply on, timing).
      const insights = contactInsights(activities);
      // A hard-bounced address is no address — treat it as unreachable so auto
      // mode falls back to another channel (or skips), never re-emailing a bounce.
      // Mirrors the cadence runner's addressFor().
      const emailTo = isEmailBounced(contact) ? undefined : contact?.points.find((p) => p.channel === "email")?.value;
      const phoneTo = contact?.points.find((p) => p.channel === "phone")?.value;
      const reachOn = (ch: "email" | "sms" | "call") => (ch === "email" ? emailTo : phoneTo);

      // Effective channel. In auto mode, if the requested channel can't reach them
      // (no address/number on file), fall back to one that can — preferring the
      // channel they actually reply on — so the touch isn't silently wasted.
      // Review mode always keeps the rep's chosen channel (they send by hand).
      let channel = task.channel as "email" | "sms" | "call";
      if (autonomy === "auto" && !reachOn(channel)) {
        const order: ("email" | "sms" | "call")[] = [insights.bestChannel ?? "sms", "sms", "call", "email"];
        const alt = order.find((c) => c !== channel && reachOn(c));
        if (alt) channel = alt;
      }

      // PROSPECT-local courtesy hours for phone channels (TCPA 8am–9pm, read
      // off the area code): never auto-text or auto-dial someone at dawn THEIR
      // time — the org-clock quiet hours in sendGate can't see a cross-country
      // number. Checked before drafting so a held touch doesn't burn an AI
      // action; nothing is logged, so the next run retries the deal once their
      // window opens. Unknown zones fail open (sendGate already held the org's
      // own night).
      if (autonomy === "auto" && (channel === "sms" || channel === "call") && outsideCourtesyWindow(reachOn(channel))) {
        actions.push({ type: task.channel, dealId: t.opp.id, title: name, detail: SKIP_LABEL.quiet_hours, result: "skipped", source: "template", value: t.recoverable });
        continue;
      }

      const history = activities.map((a) => `${a.kind}: ${a.summary}`);
      const draft = await draftMessage({
        channel,
        contactName: name,
        company: contact?.company,
        dealTitle: t.opp.title,
        valueLabel: industry.terminology.value,
        value: t.opp.value,
        currency: t.opp.currency,
        stageLabel: pipelines.flatMap((p) => p.stages).find((s) => s.id === t.opp.stageId)?.label ?? "open",
        industryLabel: industry.label,
        industryId: industry.id,
        recallReason: t.reason,
        daysSinceContact: t.days ?? daysSince(t.opp.lastActivityAt),
        history,
        instruction: task.goal,
        language: contactPreferredLanguage(contact?.attributes, org.language),
        timingHint: reachHint(insights) ?? undefined,
        voice,
      });

      const to = reachOn(channel);

      // Claim-guard: never auto-send a message that makes a financial claim
      // ($/% figures, equity, comps, rates, valuation) — hold it for human
      // approval even in full autopilot. A wrong autonomous financial statement
      // to a client is a compliance/reputation event; review mode is unaffected.
      const risky = containsUnverifiedClaim(`${draft.subject ?? ""} ${draft.body}`);
      const canAuto = autonomy === "auto" && !risky;

      // Consent gate: an AI/artificial voice needs prior express consent (FCC
      // 2024). Reactivated cold leads are exactly where consent is stale, so the
      // autonomous agent NEVER auto-dials a contact without a recorded consent
      // marker — those are handed to the human dialer (a rep confirms consent and
      // dials). This is the single biggest TCPA risk; default behavior is no
      // autonomous AI call unless consent is on file.
      const callConsent = hasCallConsent(contact);

      let result: AgentAction["result"] = "drafted";
      if (channel === "call") {
        if (canAuto && to && callConsent && voiceMinutesOk) {
          // Place the call autonomously (real dial when Twilio is set; logged
          // otherwise) — from THIS org's caller ID, like the SMS branch below.
          // Give the call brain full MEMORY so it never dials blind: who they
          // are, why now, the recent history, and the prepared talk track as
          // TALKING POINTS (not a literal opener — a call draft is a 5-bullet
          // track, which must be woven in conversationally, never read aloud).
          // The gateway opens with a short, natural line; the brain conducts the
          // rest from this context, in the org's chosen voice.
          const callContext = [
            name ? `Contact: ${name}${contact?.company ? ` at ${contact.company}` : ""}.` : "",
            t.opp.title ? `Deal: ${t.opp.title}.` : "",
            t.reason ? `Why you're calling now: ${t.reason}.` : "",
            history.length ? `Recent history (newest first): ${history.slice(0, 5).join(" | ")}` : "No prior contact logged.",
            draft.body ? `Talking points to weave in naturally (do NOT read aloud): ${draft.body}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          // Most dials hit voicemail — leave a short, AI-disclosed message (with
          // one easy reason to call back) instead of silence. Template-based, so
          // it adds no AI cost; the gateway drops it only when AMD flags a machine.
          const vmFirst = (name || "there").split(" ")[0];
          const vmSender = voice?.senderName?.trim() || org.name || "the team";
          const callVoicemail = `Hi ${vmFirst}, this is an AI assistant reaching out on behalf of ${vmSender}${t.opp.title ? ` about ${t.opp.title}` : ""}. Give us a quick call back whenever it's easy — thanks!`;
          // Sign per-call meta exactly like the manual dialer so the gateway's
          // transcript post-back to /api/calls/log attaches to THIS deal/contact
          // (and the right org) — without it, completed autopilot calls leave no
          // trace on the timeline and can't be org-attributed.
          const callMeta: Record<string, string> = {};
          if (t.opp.contactId) callMeta.contactId = t.opp.contactId;
          if (t.opp.id) callMeta.dealId = t.opp.id;
          if (org.id) callMeta.orgId = org.id;
          const res = await placeCall(to, {
            from: org.callerId,
            context: callContext,
            voiceId: org.ttsVoiceId ?? undefined,
            voicemail: callVoicemail,
            meta: Object.keys(callMeta).length ? signCallMeta(callMeta) : undefined,
          });
          result = sendOutcome(res.status);
          if (result !== "skipped") {
            sent += 1;
            await provider.logActivity({
              opportunityId: t.opp.id,
              contactId: t.opp.contactId,
              kind: "call",
              summary: `Auto-dialed. Talk track:\n${draft.body}`,
              direction: "outbound",
              occurredAt: new Date().toISOString(),
            });
            // Attribute autopilot work on an at-risk deal so won-back ROI counts it.
            if (t.reason) await recordRecallTouch({ dealId: t.opp.id, contactId: t.opp.contactId, channel: "call", source: "autopilot", industry: org.industryId });
          }
        } else {
          // Review mode / no number / claim held / NO CALL CONSENT → hand the
          // talk track to the human dialer instead of auto-dialing.
          result = "queued";
        }
      } else if (autonomy === "auto") {
        if (!to) {
          result = "skipped";
        } else if (channel === "sms" && (!hasSmsConsent(contact) || !smsPlatformReady)) {
          // TCPA: marketing SMS needs prior express consent (per contact) AND an
          // A2P 10DLC registration (platform). Either missing → hold for review
          // rather than auto-texting (mirrors the call-consent gate).
          result = "drafted";
        } else if (channel === "email" && !emailReady) {
          // CAN-SPAM + deliverability: no postal address or unverified sending
          // domain → hold for review rather than blast non-compliant email.
          result = "drafted";
        } else if (risky) {
          result = "drafted"; // claim-guard: hold the financial claim for human approval
        } else {
          const tracked = trackLinks(draft.body, { orgId: org.id, contactId: t.opp.contactId, dealId: t.opp.id, channel: channel === "email" ? "email" : "sms" });
          const res =
            channel === "email"
              ? await sendEmail(to, draft.subject ?? "", tracked, {
                  unsubscribeUrl: await unsubscribeUrl(t.opp.contactId),
                  compliance: { orgName: org.compliance.senderName ?? org.name, address: org.compliance.address },
                })
              : await sendSms(to, tracked, { from: org.callerId });
          result = sendOutcome(res.status);
          if (result !== "skipped") {
            sent += 1;
            await provider.logActivity({
              opportunityId: t.opp.id,
              contactId: t.opp.contactId,
              kind: channel,
              summary: draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body,
              direction: "outbound",
              occurredAt: new Date().toISOString(),
            });
            // Attribute autopilot work on an at-risk deal so won-back ROI counts it.
            if (t.reason) await recordRecallTouch({ dealId: t.opp.id, contactId: t.opp.contactId, channel, source: "autopilot", industry: org.industryId });
            void recordSent({ orgId: org.id, contactId: t.opp.contactId, dealId: t.opp.id, channel });
          }
        }
      }
      if (result === "drafted" || result === "queued") drafted += 1;

      // Review-mode email/SMS drafts become approval-inbox items. Tag the ones
      // working an at-risk (recall-scored) deal so the approve route attributes a
      // recall touch on send — mirroring the auto-send path's inline attribution.
      if (result === "drafted" && (channel === "email" || channel === "sms")) {
        pending.push({ dealId: t.opp.id, contactId: t.opp.contactId, channel, subject: draft.subject, body: draft.body, source: draft.source, recall: Boolean(t.reason) });
      }

      actions.push({
        type: channel,
        dealId: t.opp.id,
        title: name,
        detail: draft.subject ? `${draft.subject} — ${draft.body.slice(0, 140)}` : draft.body.slice(0, 180),
        result,
        source: draft.source,
        value: t.recoverable,
      });
    }

    const skipped = actions.filter((a) => a.result === "skipped").length;
    const verb = autonomy === "auto" && task.channel !== "none" ? `${sent} sent` : `${drafted} prepared`;
    const summary =
      targets.length === 0
        ? "No matching deals to work right now."
        : `Worked ${targets.length} deal${targets.length === 1 ? "" : "s"} · ${verb}${skipped ? ` · ${skipped} skipped (guardrails)` : ""}${recoverable > 0 ? ` · ${compactMoney(recoverable, "USD")} recoverable` : ""}.`;

    const run = await createRun({
      taskId: task.id,
      status: "completed",
      summary,
      actions,
      itemsProcessed: targets.length,
      recoverable,
      ai: isAiConfigured(),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    for (const p of pending) {
      await createOutboxItem({ runId: run.id, taskId: task.id, ...p });
    }
    await touchTask(task.id);
    return run;
  } catch (err) {
    return createRun({
      taskId: task.id,
      status: "failed",
      summary: "Run failed.",
      actions: [],
      itemsProcessed: 0,
      recoverable: 0,
      ai: isAiConfigured(),
      error: err instanceof Error ? err.message : "Unknown error",
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }
}
