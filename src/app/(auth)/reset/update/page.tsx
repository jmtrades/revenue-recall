import { ResetForm } from "@/components/ResetForm";

export const metadata = { title: "Set a new password — Revenue Recall", robots: { index: false } };

export default function ResetUpdatePage() {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Set a new password</h2>
      <p className="mt-1 text-sm text-muted">Choose a new password for your account.</p>
      <ResetForm mode="update" />
    </div>
  );
}
