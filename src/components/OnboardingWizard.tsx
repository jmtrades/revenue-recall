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
  const [yourName, setYourName] = useState("");
  const [role, setRole] = useState("");
  const [samples, setSamples] = useState("");

  const steps = ["Industry", "Workspace", "Your voice", "Team"];
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-brand";

  const [finishing, setFinishing] = useState(false);

  async function next() {
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    setFinishing(true);
    // Persist what we can (name + goal + the user's voice); ignored gracefully if no DB.
    try {
      await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: org || undefined, monthlyQuota: Number(quota) || undefined }),
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
    } catch {
      /* non-blocking */
    }
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
        <span className="font-semibold text-fg">Let&apos;s set up your workspace</span>
      </div>

      <div className="mb-8 flex gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? "bg-brand" : "bg-surface-2"}`} />
            <p className={`mt-1 text-xs ${i === step ? "text-fg" : "text-muted"}`}>{s}</p>
          </div>
        ))}
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold text-fg">What industry are you in?</h2>
            <p className="mt-1 text-sm text-muted">We&apos;ll tailor your pipeline, terminology, and templates.</p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {industries.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setIndustry(ind.id)}
                  className={`rounded-xl border p-4 text-left transition ${industry === ind.id ? "border-brand bg-brand-soft/20" : "border-border bg-surface hover:border-brand/50"}`}
                >
                  <span className="text-sm font-medium text-fg">{ind.label}</span>
                  <p className="mt-1 text-xs text-muted">{ind.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-fg">Name your workspace</h2>
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
            <h2 className="text-xl font-semibold text-fg">Teach it your voice</h2>
            <p className="mt-1 text-sm text-muted">So every email, text, and call sounds like <em>you</em> — not AI. You can refine this anytime in Settings → Voice.</p>
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="stat-label">Your name</label>
                  <input className={`${input} mt-1`} value={yourName} onChange={(e) => setYourName(e.target.value)} placeholder="Alex Carter" />
                </div>
                <div>
                  <label className="stat-label">Your role</label>
                  <input className={`${input} mt-1`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Account Executive" />
                </div>
              </div>
              <div>
                <label className="stat-label">How do you sound?</label>
                <textarea
                  className={`${input} mt-1`}
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
            <h2 className="text-xl font-semibold text-fg">Invite your team</h2>
            <p className="mt-1 text-sm text-muted">Optional — add teammate emails, one per line. Skip to do this later.</p>
            <textarea className={`${input} mt-5`} rows={5} value={invites} onChange={(e) => setInvites(e.target.value)} placeholder={"pat@acme.com\nrobin@acme.com"} />
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg disabled:opacity-0">
          ← Back
        </button>
        <button onClick={next} disabled={finishing} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
          {step === steps.length - 1 ? (finishing ? "Setting up…" : "Finish & enter →") : "Continue"}
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted">Your selections persist once a database is connected.</p>
    </div>
  );
}
