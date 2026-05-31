import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";

export const dynamic = "force-dynamic";

/** Lightweight metadata for create forms: stages, contacts, owners, currency. */
export async function GET() {
  const provider = getProvider();
  const [pipelines, contacts, users] = await Promise.all([
    provider.listPipelines(),
    provider.listContacts(),
    provider.listUsers(),
  ]);
  const org = await getOrgSettings();
  const industry = getIndustry(org.industryId);
  // A provider can return zero pipelines (empty/transient/just-connected source);
  // fall back to the org's industry template so the create-form metadata never 500s.
  const pipeline = pipelines[0] ?? (industry.pipeline as typeof pipelines[number]);
  const firstOpen = pipeline.stages.find((s) => s.type === "open") ?? pipeline.stages[0];

  return NextResponse.json({
    pipelineId: pipeline.id,
    defaultStageId: firstOpen?.id,
    currency: org.currency,
    terminology: industry.terminology,
    stages: pipeline.stages.map((s) => ({ id: s.id, label: s.label, type: s.type })),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, company: c.company ?? "" })),
    owners: users.map((u) => ({ id: u.id, name: u.name })),
  });
}
