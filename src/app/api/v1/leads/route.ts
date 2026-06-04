import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { withApiKey, readLimit } from "@/lib/api/auth";
import { getProvider } from "@/lib/crm/registry";
import { safePipeline } from "@/lib/queries";
import { getLeadRows } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { enroll } from "@/lib/cadence";
import type { ContactPoint } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

/**
 * Public Lead Capture API — POST creates, GET lists. Authenticated by the
 * workspace API key (see lib/api/auth). POST is the programmatic top-of-funnel:
 * a website form, Zapier, or a backend pushes a lead and the autonomous engine
 * immediately starts working it. GET lets a customer sync leads back out.
 */

const Body = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    company: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
    value: z.number().nonnegative().max(1e12).optional(),
    source: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
    dealTitle: z.string().trim().max(200).optional(),
    sequenceId: z.string().trim().max(80).optional(),
  })
  // A lead with no way to reach them is useless — require at least one channel.
  .refine((d) => Boolean(d.email || d.phone), { message: "email or phone is required" });

export const POST = withGuard(
  withApiKey(async (req: Request) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const lead = parsed.data;

    const provider = getProvider();
    const [pipelines, org] = await Promise.all([provider.listPipelines(), getOrgSettings()]);
    const pipeline = safePipeline(pipelines);
    const stage = pipeline.stages.find((s) => s.type === "open") ?? pipeline.stages[0];
    if (!stage) return NextResponse.json({ error: "No pipeline stage available" }, { status: 409 });

    const points: ContactPoint[] = [];
    if (lead.email) points.push({ channel: "email", value: lead.email });
    if (lead.phone) points.push({ channel: "phone", value: lead.phone });

    const contact = await provider.createContact({ name: lead.name, company: lead.company, title: lead.title, points });

    const opp = await provider.createOpportunity({
      title: lead.dealTitle || (lead.company ? `${lead.company} — ${lead.name}` : lead.name),
      pipelineId: pipeline.id,
      stageId: stage.id,
      value: lead.value ?? 0,
      currency: org.currency,
      contactId: contact.id,
      source: lead.source || "API",
    });

    if (lead.notes) {
      await provider
        .logActivity({
          contactId: contact.id,
          opportunityId: opp.id,
          kind: "note",
          summary: lead.notes,
          direction: "inbound",
          occurredAt: new Date().toISOString(),
        })
        .catch(() => undefined); // a note failure must not fail the capture
    }

    let enrolled = false;
    if (lead.sequenceId) {
      // Best-effort: a bad sequence id shouldn't reject an otherwise-good lead.
      const res = await enroll(lead.sequenceId, `deal:${opp.id}`).catch(() => null);
      enrolled = Boolean(res && res.enrolled > 0);
    }

    return NextResponse.json({ ok: true, contactId: contact.id, dealId: opp.id, enrolled }, { status: 201 });
  }),
);

/** List leads (contacts) with their primary deal — a clean, stable v1 shape. */
export const GET = withGuard(
  withApiKey(async (req: Request) => {
    const { rows } = await getLeadRows();
    const limit = readLimit(req);
    const data = rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      company: r.company,
      email: r.email,
      phone: r.phone,
      owner: r.owner,
      value: r.value,
      currency: r.currency,
      stage: r.stage,
      status: r.status ?? null,
    }));
    return NextResponse.json({ data, count: data.length, total: rows.length });
  }),
);
