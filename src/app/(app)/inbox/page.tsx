import { getInbox } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { templatesFor } from "@/lib/templates";
import { getActiveVoice } from "@/lib/voice";
import { PageHeader } from "@/components/ui";
import { InboxView } from "@/components/InboxView";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [threads, org, voice] = await Promise.all([getInbox(), getOrgSettings(), getActiveVoice()]);
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Every conversation across email, SMS, and calls in one place." />
      <InboxView threads={threads} templates={templatesFor(org.industryId)} sender={{ name: voice.senderName, bookingUrl: voice.bookingUrl }} />
    </div>
  );
}
