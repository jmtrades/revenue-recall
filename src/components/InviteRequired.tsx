import { signOut } from "@/app/(auth)/actions";

/**
 * Shown when a signed-in user has no workspace on an invite-only (private)
 * deployment — i.e. they authenticated but were never invited. It's a dead end
 * by design: no app chrome, no data, just a clear explanation and a way out.
 */
export function InviteRequired({ email }: { email?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center text-body">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface px-7 py-10 shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft/60 text-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-semibold text-fg">This workspace is invite-only</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {email ? <>You&apos;re signed in as <span className="font-medium text-fg">{email}</span>, but </> : "You're signed in, but "}
          this account hasn&apos;t been invited yet. Ask an admin to send an invite to your email, then sign back in.
        </p>
        <form action={signOut} className="mt-7">
          <button type="submit" className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-surface-2">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
