import { ResetForm } from "@/components/ResetForm";

export const metadata = { title: "Reset password — Revenue Recall" };

export default function ResetPage() {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Reset your password</h2>
      <p className="mt-1 text-sm text-muted">Enter your email and we&apos;ll send you a link to set a new password.</p>
      <ResetForm mode="request" />
    </div>
  );
}
