import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { RememberTrialPlan } from "@/components/RememberTrialPlan";

export const metadata = { title: "Create account — Revenue Recall" };

export default function SignupPage({ searchParams }: { searchParams?: { plan?: string } }) {
  const plan = searchParams?.plan;
  const isTrial = plan === "growth" || plan === "team";
  return (
    <div>
      <RememberTrialPlan plan={plan} />
      <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Create your account</h2>
      <p className="mt-1 text-sm text-muted">{isTrial ? "Create your account to start your 14-day free trial — free for 14 days, cancel anytime." : "Start recovering revenue in minutes."}</p>
      <AuthForm mode="signup" />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
