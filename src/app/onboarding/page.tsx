import { INDUSTRIES } from "@/lib/industries";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { InviteRequired } from "@/components/InviteRequired";
import { getSessionUser } from "@/lib/auth";
import { inviteOnlyEnabled } from "@/lib/config";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";

export const metadata = { title: "Get started — Revenue Recall" };

export default async function OnboardingPage() {
  // Invite-only deployment: a signed-in user with no workspace was never invited,
  // so don't show the setup wizard for a workspace they can't create — show the
  // same "invite required" dead-end as the app shell. (This route lives outside
  // the (app) group, so it isn't covered by that layout's gate.) Flag off = no-op.
  if (inviteOnlyEnabled()) {
    const user = await getSessionUser().catch(() => null);
    if (user && !(await resolveActiveOrgId().catch(() => null))) {
      return <InviteRequired email={user.email} />;
    }
  }
  const industries = INDUSTRIES.map((i) => ({ id: i.id, label: i.label, blurb: i.blurb }));
  return <OnboardingWizard industries={industries} />;
}
