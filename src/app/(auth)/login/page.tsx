import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in — Revenue Recall" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-fg">Welcome back</h2>
      <p className="mt-1 text-sm text-muted">Sign in to your workspace.</p>
      <AuthForm mode="login" next={searchParams.next} />
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="text-brand hover:underline">Create an account</Link>
      </p>
    </div>
  );
}
