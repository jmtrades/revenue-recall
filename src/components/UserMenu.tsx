"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { signOut } from "@/app/(auth)/actions";

export function UserMenu({ name, email, signedIn }: { name: string; email?: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 transition hover:bg-surface-2">
        <Avatar name={name} size={26} />
        <span className="hidden text-sm text-fg sm:inline">{name}</span>
        <svg className="hidden text-muted sm:inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(14rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-medium text-fg">{name}</div>
              {email && <div className="truncate text-xs text-muted">{email}</div>}
            </div>
            <a href="/settings" className="block px-4 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">Settings</a>
            {signedIn ? (
              <form action={signOut}>
                <button type="submit" className="block w-full px-4 py-2.5 text-left text-sm text-danger transition hover:bg-surface-2">Sign out</button>
              </form>
            ) : (
              <a href="/login" className="block px-4 py-2.5 text-sm text-brand transition hover:bg-surface-2">Sign in</a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
