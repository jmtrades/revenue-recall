import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { RememberPlan } from "@/components/RememberPlan";

export const metadata = { title: "Create account — Revenue Recall" };

export default function SignupPage({ searchParams }: { searchParams?: { plan?: string } }) {
  const plan = searchParams?.plan;
  const isPaid = plan === "growth" || plan === "team";
  return (
    <div>
      <RememberPlan plan={plan} />
      <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Create your account</h2>
      <p className="mt-1 text-sm text-muted">{isPaid ? "Create your account — we'll take you straight to checkout, and you're live in minutes." : "Start recovering revenue in minutes."}</p>
      <AuthForm mode="signup" />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
