import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { RememberPlan } from "@/components/RememberPlan";
import { normalizePlanParam } from "@/lib/billing/plans";
import { inviteOnlyEnabled } from "@/lib/config";
import { anyOrgExists } from "@/lib/supabase/provision";

export const metadata = {
  title: "Create account — Revenue Recall",
  description:
    "Start with Revenue Recall — autonomous outbound that works every deal across email, SMS, and the phone. Live in two minutes, with any CRM or none.",
};

export default async function SignupPage({ searchParams }: { searchParams?: { plan?: string } }) {
  // Accept marketing names (?plan=operator/autopilot) or legacy keys (growth/team)
  // and store the canonical PlanId so checkout works either way.
  const plan = normalizePlanParam(searchParams?.plan);
  const isPaid = plan === "growth" || plan === "team";
  // Invite-only deployment: once a workspace exists, only invited emails can join
  // (the signUp action enforces this). Say so upfront so an uninvited visitor
  // isn't surprised after filling the form — but keep the form, since invited
  // people create their account here too. Matches the gate's exact condition.
  const inviteOnly = inviteOnlyEnabled() && (await anyOrgExists());
  return (
    <div>
      <RememberPlan plan={plan} />
      <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Create your account</h2>
      <p className="mt-1 text-sm text-muted">{isPaid ? "Create your account — we'll take you straight to checkout, and you're live in minutes." : "Start recovering revenue in minutes."}</p>
      {inviteOnly && (
        <p className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
          This workspace is invite-only. If you&apos;ve been invited, sign up with the email your invite was sent to. Otherwise, ask an admin to invite you.
        </p>
      )}
      <AuthForm mode="signup" />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
