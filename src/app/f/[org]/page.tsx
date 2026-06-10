import type { Metadata } from "next";
import { verifyFormToken } from "@/lib/forms";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getOrgSettings } from "@/lib/org";
import { prospectStrings, fill } from "@/lib/i18n/prospect";

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
  let language: string | undefined;
  if (valid) {
    const settings = await runWithOrg(org, () => getOrgSettings().catch(() => null));
    if (settings?.name) brand = settings.name;
    language = settings?.language;
  }
  // The prospect sees the org's SELLING language; an invalid link gets English.
  const s = prospectStrings(valid ? language : undefined);

  return (
    <main dir={s.dir} className="hero-glow relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4 py-10">
      <div className="surface-grid absolute inset-0 opacity-30" aria-hidden />
      <div className="raised relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 animate-fade-up">
        {!valid ? (
          <div className="text-center">
            <h1 className="font-display text-lg font-semibold text-fg">{s.formUnavailableTitle}</h1>
            <p className="mt-2 text-sm text-muted">{s.formUnavailableBody}</p>
          </div>
        ) : searchParams.sent === "1" ? (
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/15 text-2xl text-success">✓</div>
            <h1 className="font-display text-lg font-semibold text-fg">{s.formThanksTitle}</h1>
            <p className="mt-2 text-sm text-muted">{fill(s.formThanksBody, { brand })}</p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold text-fg">{fill(s.formHeading, { brand })}</h1>
            <p className="mt-1 text-sm text-muted">{s.formSub}</p>
            {searchParams.error === "1" && (
              <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{s.formErrorNameContact}</div>
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
                <label className="mb-1 block text-xs text-muted">{s.labelName} *</label>
                <input name="name" required maxLength={200} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{s.labelEmail}</label>
                <input name="email" type="email" maxLength={200} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{s.labelPhone}</label>
                <input name="phone" type="tel" maxLength={40} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{s.labelCompany}</label>
                <input name="company" maxLength={200} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{s.labelMessage}</label>
                <textarea name="message" rows={3} maxLength={2000} className={field} />
              </div>
              <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90">
                {s.send}
              </button>
              <p className="text-center text-[11px] text-muted">{s.formFootnote}</p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
