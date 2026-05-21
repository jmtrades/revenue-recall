import type { Activity, Contact, Opportunity, Pipeline, User } from "@/lib/crm/types";
import { getIndustry } from "@/lib/industries";

export interface Dataset {
  users: User[];
  pipelines: Pipeline[];
  contacts: Contact[];
  opportunities: Opportunity[];
  activities: Activity[];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/** Small deterministic PRNG so the demo dataset is stable across reloads. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const FIRST = ["Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Drew", "Reese", "Skyler", "Cameron", "Devon", "Harper"];
const LAST = ["Carter", "Nguyen", "Patel", "Garcia", "Smith", "Khan", "Rossi", "Müller", "Silva", "Olsen", "Adams", "Brooks", "Chen", "Diaz", "Evans", "Ford"];
const COMPANIES = ["Northwind", "Acme Holdings", "Bluepeak", "Vertex Group", "Harborline", "Summit & Co", "Lumen Labs", "Ironwood", "Cedar Realty", "Meridian"];
const SOURCES = ["Website", "Referral", "Cold Call", "Zillow", "Facebook Ads", "Google Ads", "Open House", "Inbound", "Partner"];

/**
 * Generate a realistic dataset for an industry, with a healthy mix of active,
 * stale, and lost opportunities so the recall engine has something to surface.
 */
export function seedDataset(industryId: string): Dataset {
  const industry = getIndustry(industryId);
  const pipeline = industry.pipeline as Pipeline;
  const rand = rng(industryId.split("").reduce((a, c) => a + c.charCodeAt(0), 7));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const users: User[] = [
    { id: "u_1", name: "You", email: "you@example.com" },
    { id: "u_2", name: "Pat Reyes", email: "pat@example.com" },
    { id: "u_3", name: "Robin Lee", email: "robin@example.com" },
  ];

  const openStages = pipeline.stages.filter((s) => s.type === "open");
  const wonStage = pipeline.stages.find((s) => s.type === "won")!;
  const lostStage = pipeline.stages.find((s) => s.type === "lost")!;

  const contacts: Contact[] = [];
  const opportunities: Opportunity[] = [];
  const activities: Activity[] = [];

  const COUNT = 36;
  for (let i = 0; i < COUNT; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const company = pick(COMPANIES);
    const cid = `c_${i + 1}`;
    contacts.push({
      id: cid,
      name,
      company,
      points: [
        { channel: "email", value: `${name.toLowerCase().replace(/[^a-z]/g, ".")}@${company.toLowerCase().replace(/[^a-z]/g, "")}.com` },
        { channel: "phone", value: `+1 (555) ${100 + i}-${1000 + i}` },
      ],
      attributes: {},
    });

    // Distribute outcomes: ~45% active, ~30% stale-open, ~25% lost/won.
    const roll = rand();
    let stageId: string;
    let lastActivityDays: number;
    let closedAt: string | undefined;
    let lossReason: string | undefined;

    if (roll < 0.45) {
      stageId = pick(openStages).id;
      lastActivityDays = Math.floor(rand() * 6);
    } else if (roll < 0.7) {
      // stale open — prime recall candidates
      stageId = pick(openStages).id;
      lastActivityDays = 30 + Math.floor(rand() * 120);
    } else if (roll < 0.85) {
      stageId = wonStage.id;
      lastActivityDays = 20 + Math.floor(rand() * 60);
      closedAt = daysAgo(lastActivityDays);
    } else {
      stageId = lostStage.id;
      lastActivityDays = 30 + Math.floor(rand() * 150);
      closedAt = daysAgo(lastActivityDays);
      lossReason = pick(["No response", "Went with competitor", "Budget", "Timing", "Lost to DIY", "Unqualified"]);
    }

    const value = Math.round((2000 + rand() * 48000) / 100) * 100;
    const createdDays = lastActivityDays + 10 + Math.floor(rand() * 60);
    const oid = `o_${i + 1}`;
    opportunities.push({
      id: oid,
      title: `${name} — ${industry.terminology.opportunity}`,
      pipelineId: pipeline.id,
      stageId,
      value,
      currency: industry.currency,
      contactId: cid,
      ownerId: pick(users).id,
      source: pick(SOURCES),
      createdAt: daysAgo(createdDays),
      updatedAt: daysAgo(lastActivityDays),
      lastActivityAt: daysAgo(lastActivityDays),
      expectedCloseAt: closedAt ? undefined : daysFromNow(7 + Math.floor(rand() * 45)),
      closedAt,
      lossReason,
      tags: [],
    });

    // A short, realistic activity history per deal (newest = lastActivityDays).
    const historyLen = 1 + Math.floor(rand() * 4);
    const SUMMARIES: Record<string, string[]> = {
      call: ["Discovery call — mapped needs and timeline", "Left voicemail, no answer", "Great call, strong interest", "Quick check-in call"],
      email: ["Sent intro + overview", "Shared pricing and next steps", "Followed up after no reply", "Sent proposal for review"],
      sms: ["Texted to confirm availability", "Sent a quick nudge", "Confirmed appointment by text"],
      meeting: ["Demo / walkthrough completed", "In-person meeting", "Stakeholder review meeting"],
      note: ["Logged context from referral", "Noted budget and decision process", "Competitor mentioned"],
    };
    let touch = lastActivityDays;
    for (let h = 0; h < historyLen; h++) {
      const kind = pick(["call", "email", "sms", "meeting", "note"]) as Activity["kind"];
      activities.push({
        id: `a_${oid}_${h}`,
        opportunityId: oid,
        contactId: cid,
        kind,
        summary: pick(SUMMARIES[kind] ?? ["Activity logged"]),
        occurredAt: daysAgo(touch),
        direction: kind === "note" ? undefined : rand() > 0.4 ? "outbound" : "inbound",
        ownerId: opportunities[opportunities.length - 1].ownerId,
      });
      touch += 2 + Math.floor(rand() * 9);
    }
  }

  return { users, pipelines: [pipeline], contacts, opportunities, activities };
}
