import { getInbox } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { InboxView } from "@/components/InboxView";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const threads = await getInbox();
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Every conversation across email, SMS, and calls in one place." />
      <InboxView threads={threads} />
    </div>
  );
}
