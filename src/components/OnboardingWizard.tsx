"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface IndustryOption { id: string; label: string; blurb: string }

export function OnboardingWizard({ industries }: { industries: IndustryOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState("real_estate");
  const [org, setOrg] = useState("");
  const [quota, setQuota] = useState("250000");
  const [invites, setInvites] = useState("");

  const steps = ["Industry", "Workspace", "Team"];
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-brand";

  function next() {
    if (step < steps.length - 1) setStep(step + 1);
    else router.push("/");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
        <span className="font-semibold text-white">Let&apos;s set up your workspace</span>
      </div>

      <div className="mb-8 flex gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? "bg-brand" : "bg-surface-2"}`} />
            <p className={`mt-1 text-xs ${i === step ? "text-white" : "text-muted"}`}>{s}</p>
          </div>
        ))}
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold text-white">What industry are you in?</h2>
            <p className="mt-1 text-sm text-muted">We&apos;ll tailor your pipeline, terminology, and templates.</p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {industries.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setIndustry(ind.id)}
                  className={`rounded-xl border p-4 text-left transition ${industry === ind.id ? "border-brand bg-brand-soft/20" : "border-border bg-surface hover:border-brand/50"}`}
                >
                  <span className="text-sm font-medium text-white">{ind.label}</span>
                  <p className="mt-1 text-xs text-muted">{ind.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-white">Name your workspace</h2>
            <p className="mt-1 text-sm text-muted">You can change this anytime in settings.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="stat-label">Organization name</label>
                <input className={`${input} mt-1`} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Acme Realty" />
              </div>
              <div>
                <label className="stat-label">Monthly revenue goal</label>
                <input className={`${input} mt-1`} type="number" value={quota} onChange={(e) => setQuota(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-white">Invite your team</h2>
            <p className="mt-1 text-sm text-muted">Optional — add teammate emails, one per line. Skip to do this later.</p>
            <textarea className={`${input} mt-5`} rows={5} value={invites} onChange={(e) => setInvites(e.target.value)} placeholder={"pat@acme.com\nrobin@acme.com"} />
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-white disabled:opacity-0">
          ← Back
        </button>
        <button onClick={next} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90">
          {step === steps.length - 1 ? "Finish & enter →" : "Continue"}
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">Your selections persist once a database is connected.</p>
    </div>
  );
}
