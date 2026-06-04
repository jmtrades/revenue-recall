import type { Metadata } from "next";
import { verifyFormToken } from "@/lib/forms";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getOrgSettings } from "@/lib/org";

export const dynamic = "force-dynamic";
// A public lead form shouldn't be indexed (it's embedded on customers' sites).
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: { org: string };
  searchParams: { k?: string; sent?: string; error?: string };
}

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-brand";

export default async function HostedLeadForm({ params, searchParams }: Props) {
  const org = decodeURIComponent(params.org);
  const token = searchParams.k ?? "";
  const valid = verifyFormToken(org, token);

  let brand = "us";
  if (valid) {
    const name = await runWithOrg(org, () => getOrgSettings().then((s) => s.name).catch(() => null));
    if (name) brand = name;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
        {!valid ? (
          <div className="text-center">
            <h1 className="font-display text-lg font-semibold text-fg">Form unavailable</h1>
            <p className="mt-2 text-sm text-muted">This form link is invalid or has expired. Please contact the site owner.</p>
          </div>
        ) : searchParams.sent === "1" ? (
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/15 text-2xl text-success">✓</div>
            <h1 className="font-display text-lg font-semibold text-fg">Thanks — we&apos;ll be in touch</h1>
            <p className="mt-2 text-sm text-muted">Your details are in. Someone from {brand} will reach out shortly.</p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold text-fg">Get in touch with {brand}</h1>
            <p className="mt-1 text-sm text-muted">Leave your details and we&apos;ll reach out.</p>
            {searchParams.error === "1" && (
              <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                Please enter your name and an email or phone.
              </div>
            )}
            <form action="/api/forms/submit" method="POST" className="mt-4 space-y-3">
              <input type="hidden" name="org" value={org} />
              <input type="hidden" name="token" value={token} />
              {/* Honeypot — hidden from real users, traps bots. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />
              <div>
                <label className="mb-1 block text-xs text-muted">Name *</label>
                <input name="name" required maxLength={200} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Email</label>
                <input name="email" type="email" maxLength={200} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Phone</label>
                <input name="phone" type="tel" maxLength={40} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Company</label>
                <input name="company" maxLength={200} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Message</label>
                <textarea name="message" rows={3} maxLength={2000} className={field} />
              </div>
              <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90">
                Send
              </button>
              <p className="text-center text-[11px] text-muted">Provide an email or a phone number so we can reply.</p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
