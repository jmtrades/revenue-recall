"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface IndustryOption { id: string; label: string; blurb: string }

export function OnboardingWizard({ industries }: { industries: IndustryOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState("real_estate");
  const [org, setOrg] = useState("");
  const [senderName, setSenderName] = useState("");
  const [quota, setQuota] = useState("250000");
  const [invites, setInvites] = useState("");

  // AI setup state
  const [description, setDescription] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState("");

  const steps = ["Describe", "Industry", "Workspace", "Team"];
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-brand";

  const [finishing, setFinishing] = useState(false);

  // Turn the free-text description into a tailored setup, then advance.
  async function build() {
    if (description.trim().length < 8) return;
    setAiBusy(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/ai/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const plan = await res.json().catch(() => null);
      if (res.ok && plan) {
        if (plan.industryId) setIndustry(plan.industryId);
        if (plan.orgName) setOrg(plan.orgName);
        if (plan.senderName) setSenderName(plan.senderName);
        if (plan.monthlyQuota) setQuota(String(plan.monthlyQuota));
        setAiSummary(plan.summary ?? "");
      }
    } catch {
      /* fall through to manual */
    }
    setAiBusy(false);
    setStep(1);
  }

  async function next() {
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    setFinishing(true);
    try {
      await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: org || undefined, monthlyQuota: Number(quota) || undefined, industryId: industry }),
      });
    } catch {
      /* non-blocking */
    }
    // Seed a tailored AI voice from their own description, so outreach sounds like them from day one.
    if (description.trim().length >= 8) {
      try {
        await fetch("/api/voice/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderName: senderName || undefined, samples: description }),
        });
      } catch {
        /* non-blocking */
      }
    }
    router.push("/dashboard");
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
            <h2 className="text-xl font-semibold text-white">Tell us about your business</h2>
            <p className="mt-1 text-sm text-muted">
              One or two sentences — what you sell and how you sell it. We&apos;ll build your pipeline, terminology, and AI
              voice around it. The more you say, the more it sounds like you.
            </p>
            <textarea
              className={`${input} mt-5`}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. I'm a mortgage loan officer in Austin. I work mostly refinance and purchase leads, and I follow up by text and email — friendly and casual, never pushy."
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={build}
                disabled={aiBusy || description.trim().length < 8}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
              >
                {aiBusy ? "Building your workspace…" : "Build my workspace →"}
              </button>
              <button onClick={() => setStep(1)} className="text-sm text-muted transition hover:text-white">
                or set up manually
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-white">Your industry</h2>
            <p className="mt-1 text-sm text-muted">
              {aiSummary || "We tailor your pipeline, terminology, and templates to this."}
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {industries
                .filter((ind) => !ind.id.endsWith("_default"))
                .map((ind) => (
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

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-white">Name your workspace</h2>
            <p className="mt-1 text-sm text-muted">You can change any of this later in settings.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="stat-label">Organization name</label>
                <input className={`${input} mt-1`} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Acme Realty" />
              </div>
              <div>
                <label className="stat-label">Your name (so outreach signs off as you)</label>
                <input className={`${input} mt-1`} value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Jordan" />
              </div>
              <div>
                <label className="stat-label">Monthly revenue goal</label>
                <input className={`${input} mt-1`} type="number" value={quota} onChange={(e) => setQuota(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
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
        {step > 0 && (
          <button onClick={next} disabled={finishing} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
            {step === steps.length - 1 ? (finishing ? "Setting up…" : "Finish & enter →") : "Continue"}
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">Your selections persist once a database is connected.</p>
    </div>
  );
}
