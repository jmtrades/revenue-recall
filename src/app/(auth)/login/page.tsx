import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in — Revenue Recall" };

const CALLBACK_ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Please sign in again.",
  config: "Authentication isn't fully configured yet. Please contact your admin.",
  provider: "Google sign-in didn't complete — it may not be enabled yet. Use email below, or try again shortly.",
  cancelled: "Google sign-in was cancelled. You can try again, or sign in with email.",
};

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const note = searchParams.error ? CALLBACK_ERRORS[searchParams.error] : undefined;
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Welcome back</h2>
      <p className="mt-1 text-sm text-muted">Sign in to your workspace.</p>
      {note && (
        <p className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">{note}</p>
      )}
      <AuthForm mode="login" next={searchParams.next} />
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">Create an account</Link>
      </p>
    </div>
  );
}
