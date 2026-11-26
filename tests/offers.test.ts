import { describe, expect, it } from "vitest";
import { blockedEmail } from "@/lib/offers/catalog";
import { mapLeadgen } from "@/lib/offers/leadgen";
import { dedupeLeads, estimateReactivation, parseLeadList } from "@/lib/offers/reactivation";
import { parseScheduleEvent } from "@/lib/offers/schedule";
import { planSetterOutreach } from "@/lib/offers/setter";
import { triageLead } from "@/lib/offers/triage";
import { smsBody } from "@/lib/webinar/copy";
import type { WebinarRegistrant, WebinarSession } from "@/lib/webinar/types";
import { adsReport } from "@/lib/ads/rollup";
import type { StoredEvent, SpendRow } from "@/lib/ads/store";
import { POST as setterPost } from "@/app/api/offers/setter-demo/route";

describe("appointment-setting offers", () => {
  it("refuses the two blocked inboxes", () => {
    expect(blockedEmail("jmtrades1990@gmail.com")).toBe(true);
    expect(blockedEmail("JuniorContentAI@gmail.com")).toBe(true);
    expect(blockedEmail("qa@example.com")).toBe(false);
  });

  it("tags hot, warm, and cold from BANT and revenue", () => {
    const hot = triageLead({ text: "I'm the founder and I need this this month, budget is fine", monthlyRevenue: 40000 });
    expect(hot.band).toBe("hot");
    expect(hot.qualified).toBe(true);
    const cold = triageLead({ text: "just looking" });
    expect(cold.band).toBe("cold");
    expect(cold.qualified).toBe(false);
  });

  it("logs the call when the number is not verified on a trial account", () => {
    const plan = planSetterOutreach({
      email: "qa@example.com",
      phone: "+15555550100",
      voiceReady: true,
      verified: new Set(["+16502885280"]),
      bookingUrl: "https://example.com/book",
    });
    expect(plan.call).toBe("skipped");
    expect(plan.sms).toBe("sent");
    expect(plan.reason).toBe("twilio_trial_unverified");
    expect(planSetterOutreach({ email: "qa@example.com", phone: "+15555550100", test: true }).reason).toBe("test_mode");
    expect(planSetterOutreach({ email: "jmtrades1990@gmail.com", phone: "+15555550100" }).call).toBe("blocked");
  });

  it("parses, dedupes, and estimates a reactivation list without sending", () => {
    const parsed = parseLeadList([
      "name,email,phone,timezone",
      "Sam,sam@example.com,+15555550100,America/New_York",
      "Sam,sam@example.com,+15555550100,America/New_York",
      "Pat,pat@example.com,+15555550101,America/New_York,STOP",
      "Nope,not-an-email,",
    ].join("\n"));
    const unique = dedupeLeads(parsed.leads);
    expect(unique).toHaveLength(2);
    const noon = new Date("2026-06-10T16:00:00Z");
    const estimate = estimateReactivation(unique, noon);
    expect(estimate.optedOut).toBe(1);
    expect(estimate.reachable).toBe(1);
    expect(estimate.reachableNow).toBe(1);
  });

  it("reads a no-show and a Meta instant form", () => {
    expect(parseScheduleEvent({ event: "invitee_no_show.created", payload: { email: "a@b.co" } })?.kind).toBe("no_show");
    expect(parseScheduleEvent({ event: "invitee.created", payload: { email: "a@b.co" } })?.kind).toBe("booked");
    const lead = mapLeadgen({
      form_name: "reactivation audit",
      field_data: [
        { name: "full_name", values: ["Sam"] },
        { name: "email", values: ["sam@example.com"] },
        { name: "phone_number", values: ["+15555550100"] },
      ],
    });
    expect(lead?.offer).toBe("reactivation-audit");
    expect(lead?.email).toBe("sam@example.com");
  });

  it("offers a replay or a call instead of a rejoin link", () => {
    const body = smsBody(
      { id: "r", sessionId: "s", state: "left", name: "Sam", consent: { call: true, sms: true, email: true }, doNotContact: false, phoneInvalid: false, present: false, joinCount: 1, leaveCount: 1, late: false, watchedReplay: false, replayCompleted: false, voicemailDropped: false, attempts: { call: 0, sms: 0, email: 0, voicemail: 0 }, dayKey: "2026-06-10", day: { call: 0, sms: 0, email: 0 }, actions: [], version: 1, recoveryActive: true } as WebinarRegistrant,
      { id: "s", provider: "zoom", title: "Offer", phase: "live", rejoinUrl: "https://join.example/room" } as WebinarSession,
      "rejoin",
    );
    expect(body.toLowerCase()).not.toContain("rejoin");
    expect(body.toLowerCase()).toContain("replay");
  });

  it("reports cost per qualified lead and show rate by offer", () => {
    const events: StoredEvent[] = [
      { id: "1", name: "Lead", at: "2026-06-10T12:00:00Z", source: "meta", medium: "paid", campaign: "setter-demo", content: "", term: "", landing: "/setter-demo", offer: "setter-demo", qualified: true },
      { id: "2", name: "Schedule", at: "2026-06-10T13:00:00Z", source: "meta", medium: "paid", campaign: "setter-demo", content: "", term: "", landing: "/build-call", offer: "setter-demo", scheduleKind: "booked" },
      { id: "3", name: "Schedule", at: "2026-06-10T14:00:00Z", source: "meta", medium: "paid", campaign: "setter-demo", content: "", term: "", landing: "/build-call", offer: "setter-demo", scheduleKind: "show" },
    ];
    const spend: SpendRow[] = [{ id: "s", date: "2026-06-10", source: "meta", campaign: "setter-demo", amount: 100, currency: "USD" }];
    const row = adsReport(events, spend, null, null).byOffer.find((r) => r.key === "setter-demo");
    expect(row?.qualified).toBe(1);
    expect(row?.bookings).toBe(1);
    expect(row?.costPerQualified).toBe(100);
    expect(row?.showRate).toBe(1);
  });

  it("stores a test setter lead and does not accept a blocked inbox", async () => {
    const ok = await setterPost(new Request("http://local/api/offers/setter-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sam", email: "qa-setter@example.com", phone: "+15555550100", business: "Coaching", monthlyRevenue: 20000, consent: true, test: true }),
    }));
    const saved = await ok.json() as { ok: boolean; reason: string; call: string };
    expect(saved.ok).toBe(true);
    expect(saved.reason).toBe("test_mode");
    expect(saved.call).toBe("logged");
    const blocked = await setterPost(new Request("http://local/api/offers/setter-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Junior", email: "jmtrades1990@gmail.com", phone: "+15555550100", business: "Coaching", consent: true, test: true }),
    }));
    expect(blocked.status).toBe(400);
  });
});
