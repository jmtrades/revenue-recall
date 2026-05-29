import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import type { ContactPoint, Stage } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

const Row = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  value: z.number().nonnegative().max(1_000_000_000).optional(),
  stage: z.string().max(120).optional(),
});

const Body = z.object({ rows: z.array(Row).min(1).max(2000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });

  const provider = getProvider();
  if (!provider.info().capabilities.write) {
    return NextResponse.json({ error: "The active CRM is read-only; import is unavailable." }, { status: 409 });
  }

  let pipeline;
  try {
    pipeline = (await provider.listPipelines())[0];
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load pipeline" }, { status: 409 });
  }
  if (!pipeline) return NextResponse.json({ error: "No pipeline configured" }, { status: 409 });

  const currency = (await getOrgSettings()).currency;
  const stages = pipeline.stages;
  const defaultStage = stages.find((s) => s.type === "open") ?? stages[0];

  const matchStage = (label?: string): Stage => {
    if (!label) return defaultStage;
    const l = label.trim().toLowerCase();
    return (
      stages.find((s) => s.label.toLowerCase() === l) ??
      stages.find((s) => s.label.toLowerCase().includes(l) || l.includes(s.label.toLowerCase())) ??
      defaultStage
    );
  };

  let contacts = 0;
  let deals = 0;
  const errors: string[] = [];

  for (const r of parsed.data.rows) {
    try {
      const points: ContactPoint[] = [
        ...(r.email ? [{ channel: "email" as const, value: r.email }] : []),
        ...(r.phone ? [{ channel: "phone" as const, value: r.phone }] : []),
      ];
      const contact = await provider.createContact({ name: r.name, company: r.company, points, attributes: {} });
      contacts++;

      if (r.value !== undefined || r.stage) {
        const stage = matchStage(r.stage);
        await provider.createOpportunity({
          title: r.company ? `${r.company} — ${r.name}` : r.name,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: contact.id,
          value: r.value ?? 0,
          currency,
          source: "Import",
        });
        deals++;
      }
    } catch (err) {
      errors.push(`${r.name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  return NextResponse.json({
    contacts,
    deals,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
  });
}
