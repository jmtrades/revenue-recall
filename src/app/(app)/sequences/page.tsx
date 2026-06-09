import { getConfig, isAuthRequired } from "@/lib/config";
import { allSequencesFor, listCustomSequences } from "@/lib/sequences-store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getSessionRole } from "@/lib/authz";
import { PageHeader } from "@/components/ui";
import { SequencesView } from "@/components/SequencesView";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const cfg = getConfig();
  const [sequences, custom] = await Promise.all([allSequencesFor(cfg.industryId), listCustomSequences()]);
  // Authoring: needs the database and an owner/admin once auth is live — the
  // same gate shape as the pipeline-stage and template editors.
  const canAuthor = isSupabaseConfigured() && (!isAuthRequired() || ["owner", "admin"].includes((await getSessionRole()) ?? ""));
  return (
    <div>
      <PageHeader title="Sequences" subtitle="Multi-step, multi-channel cadences — yours plus the industry presets." />
      <SequencesView sequences={sequences} customIds={custom.map((s) => s.id)} canAuthor={canAuthor} />
    </div>
  );
}
