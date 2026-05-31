"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import { Icon, type IconName } from "@/components/icons";

interface IndustryOption { id: string; label: string; blurb: string }

const INDUSTRY_ICONS: Record<string, IconName> = {
  real_estate: "home",
  mortgage: "database",
  insurance: "shield",
  saas: "layers",
  agency: "briefcase",
  auto: "car",
  home_services: "wrench",
  generic: "pipeline",
};

// Per-industry tailoring shown back to the user so onboarding feels built for them.
const INDUSTRY_TAILORING: Record<string, { pipeline: string; plays: string }> = {
  real_estate: { pipeline: "New Lead → Showing → Offer → Under Contract → Closed", plays: "buyer/seller follow-up, listing nurture, open-house recall" },
  mortgage: { pipeline: "Application → Underwriting → Approved → Funded", plays: "rate-watch re-engage, doc chase, refinance triggers" },
  insurance: { pipeline: "Quote → Application → Bound → Renewal", plays: "quote follow-up, renewal saves, cross-sell" },
  saas: { pipeline: "Trial → POC → Proposal → Closed Won", plays: "trial conversion, expansion, churn-risk recall" },
  agency: { pipeline: "Lead → Scoping → Proposal → Retainer", plays: "proposal follow-up, scope-creep upsell, win-back" },
  auto: { pipeline: "Inquiry → Test Drive → Negotiation → Delivered", plays: "test-drive recall, trade-in nurture, service upsell" },
  home_services: { pipeline: "Lead → Estimate → Scheduled → Completed", plays: "estimate follow-up, seasonal recall, review requests" },
  generic: { pipeline: "Lead → Qualified → Proposal → Won", plays: "cold-deal recall, follow-up cadences, win-back" },
};

export function OnboardingWizard({ industries }: { industries: IndustryOption[] }) {
  const router = useRouter();
  const pickable = industries.filter((i) => i.id !== "generic");

  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState("real_estate");
  const [org, setOrg] = useState("");
  const [quota, setQuota] = useState("250000");
  const [language, setLanguage] = useState("en");
  const [invites, setInvites] = useState("");
  const [yourName, setYourName] = useState("");
  const [role, setRole] = useState("");
  const [samples, setSamples] = useState("");
  const [finishing, setFinishing] = useState(false);

  const steps = ["Industry", "Workspace", "Your voice", "Team"];
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-colors focus:border-brand";
  const chosen = industries.find((i) => i.id === industry);
  const tailoring = INDUSTRY_TAILORING[industry] ?? INDUSTRY_TAILORING.generic;

  function go(to: number) {
    setStep(to);
  }

  async function next() {
    if (step < steps.length - 1) { go(step + 1); return; }
    setFinishing(true);
    try {
      await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industryId: industry, language, name: org || undefined, monthlyQuota: Number(quota) || undefined }),
      });
      if (yourName.trim() || samples.trim()) {
        await fetch("/api/voice/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderName: yourName || undefined,
            role: role || undefined,
            signature: yourName ? `— ${yourName.split(" ")[0]}` : undefined,
            samples: samples || undefined,
          }),
        });
      }
      if (invites.trim()) {
        await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: invites }),
        });
      }
    } catch {
      /* non-blocking */
    }
    // Brief "building your workspace" beat so finishing feels like the system coming alive.
    setTimeout(() => router.push("/dashboard"), 1150);
  }

  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-6 py-12">
      {/* ambient brand glow */}
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden />

      <div className="relative mb-8 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10">RR</span>
        <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Let&apos;s set up your workspace</span>
      </div>

      {/* progress */}
      <div className="relative mb-9 flex gap-2">
        {steps.map((s, i) => (
          <button key={s} onClick={() => i < step && go(i)} className={`flex-1 text-left ${i < step ? "cursor-pointer" : "cursor-default"}`}>
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{ width: i < step ? "100%" : i === step ? "50%" : "0%" }}
              />
            </div>
            <p className={`mt-1.5 flex items-center gap-1 text-xs ${i === step ? "font-medium text-fg" : i < step ? "text-brand" : "text-muted"}`}>
              {i < step && <Icon name="approvals" size={11} />}
              {s}
            </p>
          </button>
        ))}
      </div>

      <div className="relative flex-1">
          <div key={step} className="onb-step">
            {step === 0 && (
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">What do you sell?</h2>
                <p className="mt-1.5 text-sm text-muted">We tailor your pipeline, terminology, objection handling, and playbooks to match.</p>
                <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {pickable.map((ind) => {
                    const active = industry === ind.id;
                    return (
                      <button
                        key={ind.id}
                        onClick={() => setIndustry(ind.id)}
                        className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition duration-150 ${active ? "border-brand bg-brand-soft/20 ring-1 ring-inset ring-brand/30" : "border-border bg-surface hover:-translate-y-0.5 hover:border-brand/40"}`}
                      >
                        <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ring-1 ring-inset transition ${active ? "bg-brand text-white ring-white/15" : "bg-brand-soft text-brand ring-brand/20"}`}>
                          <Icon name={INDUSTRY_ICONS[ind.id] ?? "pipeline"} size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-fg">{ind.label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{ind.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* live tailoring preview — re-mounts (re-animates) on each choice */}
                <div key={industry} className="onb-fade mt-5 rounded-xl border border-brand/30 bg-brand-soft/10 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
                    <Icon name="autopilot" size={12} /> Tailored for {chosen?.label}
                  </p>
                  <p className="mt-2 text-sm text-body"><span className="text-muted">Pipeline:</span> {tailoring.pipeline}</p>
                  <p className="mt-1 text-sm text-body"><span className="text-muted">Plays:</span> {tailoring.plays}</p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Name your workspace</h2>
                <p className="mt-1.5 text-sm text-muted">You can change any of this later in Settings.</p>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="stat-label">Organization name</label>
                    <input className={`${input} mt-1.5`} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Acme Realty" />
                  </div>
                  <div>
                    <label className="stat-label">Monthly revenue goal</label>
                    <input className={`${input} mt-1.5`} type="number" value={quota} onChange={(e) => setQuota(e.target.value)} />
                    <p className="mt-1 text-xs text-muted">Drives your goal ring and forecast attainment on the dashboard.</p>
                  </div>
                  <div>
                    <label className="stat-label">Language you sell in</label>
                    <select className={`${input} mt-1.5`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label} — {l.native}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted">Every email, text, and call script is written in this language.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Teach it your voice</h2>
                <p className="mt-1.5 text-sm text-muted">So every email, text, and call sounds like <em>you</em> — not AI. Refine anytime in Settings → Voice.</p>
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="stat-label">Your name</label>
                      <input className={`${input} mt-1.5`} value={yourName} onChange={(e) => setYourName(e.target.value)} placeholder="Alex Carter" />
                    </div>
                    <div>
                      <label className="stat-label">Your role</label>
                      <input className={`${input} mt-1.5`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Account Executive" />
                    </div>
                  </div>
                  <div>
                    <label className="stat-label">How do you sound?</label>
                    <textarea
                      className={`${input} mt-1.5`}
                      rows={5}
                      value={samples}
                      onChange={(e) => setSamples(e.target.value)}
                      placeholder={"Describe your style, or paste a few of your real messages. e.g.\n“Hey Jordan — saw your trial wrapped. Worth 15 min Thursday to show you the part teams actually stick with?”"}
                    />
                    <p className="mt-1 text-xs text-muted">Optional, but it&apos;s what makes the AI write like you. Paste 2–3 real messages for the best match.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Invite your team</h2>
                <p className="mt-1.5 text-sm text-muted">Optional — add teammate emails, one per line. You can skip and do this later.</p>
                <textarea className={`${input} mt-6`} rows={5} value={invites} onChange={(e) => setInvites(e.target.value)} placeholder={"pat@acme.com\nrobin@acme.com"} />
                <div className="mt-5 rounded-xl border border-border bg-surface p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand"><Icon name="recall" size={12} /> Ready to go</p>
                  <p className="mt-2 text-sm text-body">
                    {chosen?.label} pipeline, your voice{yourName ? ` as ${yourName.split(" ")[0]}` : ""}, and the Revenue Recall engine — all set. Finish to watch it surface the revenue you&apos;re losing.
                  </p>
                </div>
              </div>
            )}
          </div>
      </div>

      <div className="relative mt-8 flex items-center justify-between">
        <button onClick={() => go(Math.max(0, step - 1))} disabled={step === 0 || finishing} className="cta inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></svg>
          Back
        </button>
        <button onClick={next} disabled={finishing} className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-2 pl-5 pr-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-70">
          {finishing ? (
            <span className="inline-flex items-center gap-2 pr-3">
              <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
              Building your workspace…
            </span>
          ) : (
            <>
              {step === steps.length - 1 ? "Finish & enter" : "Continue"}
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
              </span>
            </>
          )}
        </button>
      </div>
      <p className="relative mt-3 text-center text-[11px] text-muted">Your selections persist once a database is connected.</p>
    </div>
  );
}
