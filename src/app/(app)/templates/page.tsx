import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { listCustomTemplates, allTemplatesFor } from "@/lib/templates-store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/config";
import { getSessionRole } from "@/lib/authz";
import { PageHeader } from "@/components/ui";
import { TemplatesView } from "@/components/TemplatesView";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [org, voice, custom] = await Promise.all([getOrgSettings(), getActiveVoice(), listCustomTemplates()]);
  const templates = await allTemplatesFor(org.industryId);
  // Authoring: needs the database (custom_templates) and an owner/admin once
  // auth is live — same gate shape as the pipeline-stage editor.
  const canAuthor = isSupabaseConfigured() && (!isAuthRequired() || ["owner", "admin"].includes((await getSessionRole()) ?? ""));
  return (
    <div>
      <PageHeader title="Templates" subtitle="Reusable email & SMS messages with merge tokens — yours plus the industry presets." />
      <TemplatesView
        templates={templates}
        sender={{ name: voice.senderName, bookingUrl: voice.bookingUrl }}
        customIds={custom.map((t) => t.id)}
        canAuthor={canAuthor}
      />
    </div>
  );
}
