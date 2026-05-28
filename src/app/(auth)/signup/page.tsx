import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create account — Revenue Recall" };

export default function SignupPage() {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-fg">Create your account</h2>
      <p className="mt-1 text-sm text-muted">Start recovering revenue in minutes.</p>
      <AuthForm mode="signup" />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
