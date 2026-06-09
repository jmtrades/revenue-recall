import { getOrgSettings } from "@/lib/org";
import { templatesFor } from "@/lib/templates";
import { getActiveVoice } from "@/lib/voice";
import { PageHeader } from "@/components/ui";
import { TemplatesView } from "@/components/TemplatesView";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [org, voice] = await Promise.all([getOrgSettings(), getActiveVoice()]);
  const templates = templatesFor(org.industryId);
  return (
    <div>
      <PageHeader title="Templates" subtitle="Reusable email & SMS messages with merge tokens, tuned to your industry." />
      <TemplatesView templates={templates} sender={{ name: voice.senderName, bookingUrl: voice.bookingUrl }} />
    </div>
  );
}
