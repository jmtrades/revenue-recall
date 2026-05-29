import { getOrgSettings } from "@/lib/org";
import { templatesFor } from "@/lib/templates";
import { PageHeader } from "@/components/ui";
import { TemplatesView } from "@/components/TemplatesView";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = templatesFor((await getOrgSettings()).industryId);
  return (
    <div>
      <PageHeader title="Templates" subtitle="Reusable email & SMS messages with merge tokens, tuned to your industry." />
      <TemplatesView templates={templates} />
    </div>
  );
}
