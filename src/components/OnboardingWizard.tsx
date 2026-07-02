"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import { Icon, type IconName } from "@/components/icons";
import { getSynth } from "@/lib/voice/synth";
import { enableNeuralVoice } from "@/lib/voice/neural";
import type { SpeakHandle } from "@/lib/voice/speech";
import { LogoBadge } from "@/components/Logo";

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
  const [saveError, setSaveError] = useState<string | null>(null);

  // Conversational first step: describe the business, AI personalizes the rest.
  const [describe, setDescribe] = useState("");
  const [thinking, setThinking] = useState(false);
  const [personalized, setPersonalized] = useState<{ industryLabel: string; sells: string; ai: boolean } | null>(null);

  // "Hear how your calls will sound" — the setup-time payoff. Speaks a real
  // opener (with their own name and company woven in) in the actual ElevenLabs
  // call voice; stays silent if ElevenLabs isn't configured (no fallback voice).
  const [hearState, setHearState] = useState<"idle" | "warming" | "playing">("idle");
  const hearRef = useRef<SpeakHandle | null>(null);
  // Register the ElevenLabs voice backend so the "hear your calls" preview speaks.
  // Safe + idempotent; no-op visually.
  useEffect(() => { enableNeuralVoice(); }, []);
  useEffect(() => () => hearRef.current?.stop(), []);

  async function hearVoice() {
    if (hearState === "playing") {
      hearRef.current?.stop();
      hearRef.current = null;
      setHearState("idle");
      return;
    }
    setHearState("warming");
    const synth = getSynth();
    const first = yourName.trim().split(/\s+/)[0] || "Aria";
    const from = org.trim() || "your company";
    setHearState("playing");
    const handle = await synth.speak(
      `Hi, it's ${first} calling from ${from} — I know it's out of the blue, but I've got something worth thirty seconds. Is now okay?`,
      { emotion: "warm" },
    );
    hearRef.current = handle;
    handle.done.then(() => {
      if (hearRef.current === handle) {
        hearRef.current = null;
        setHearState("idle");
      }
    });
  }

  const steps = ["Describe", "Industry", "Workspace", "Your voice", "Team"];
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-colors focus:border-brand";
  const chosen = industries.find((i) => i.id === industry);
  const tailoring = INDUSTRY_TAILORING[industry] ?? INDUSTRY_TAILORING.generic;

  function go(to: number) {
    setStep(to);
  }

  // Send the free-text description to the personalizer; pre-fill everything and
  // show the express "ready" confirmation (stay on step 0). Only fall through to
  // the manual steps if personalization fails.
  async function personalize() {
    if (!describe.trim() || thinking) return;
    setThinking(true);
    try {
      const res = await fetch("/api/onboard/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: describe }),
      });
      if (res.ok) {
        const p = await res.json();
        if (p.industryId && industries.some((i) => i.id === p.industryId)) setIndustry(p.industryId);
        if (p.orgName) setOrg(p.orgName);
        if (p.monthlyQuota) setQuota(String(p.monthlyQuota));
        if (p.voiceTone && !samples.trim()) setSamples(p.voiceTone);
        const label = industries.find((i) => i.id === p.industryId)?.label ?? "your business";
        setPersonalized({ industryLabel: label, sells: p.sells ?? "", ai: Boolean(p.ai) });
        setThinking(false);
        return; // stay on step 0 to show the one-tap "Enter my workspace" confirmation
      }
    } catch {
      /* fall through to manual */
    }
    setThinking(false);
    go(1); // personalization unavailable → drop into the (still-usable) manual steps
  }

  // Persist everything and enter the app. Used by both the express
  // "Enter my workspace" button (after AI personalization) and the final step.
  async function finish() {
    if (finishing) return;
    setFinishing(true);
    setSaveError(null);
    try {
      // Auto-detect the workspace timezone from the browser so the daily digest
      // lands in their morning with zero setup (editable later in Settings).
      const timezone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; } })();
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Send the goal whenever it's a valid number — including 0 (`Number(x) ||
        // undefined` would silently drop a deliberate 0). Omit only when blank.
        body: JSON.stringify({ industryId: industry, language, name: org || undefined, monthlyQuota: String(quota).trim() !== "" && Number.isFinite(Number(quota)) ? Number(quota) : undefined, timezone }),
      });
      // The core save MUST land — otherwise the user enters a workspace that
      // silently lost their industry/quota/language. Surface it and let them
      // retry instead of pretending it worked.
      if (!res.ok) throw new Error("save failed");
      // Personalization + invites are genuinely best-effort — never block entry.
      if (yourName.trim() || samples.trim() || describe.trim()) {
        await fetch("/api/voice/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderName: yourName || undefined,
            role: role || undefined,
            signature: yourName ? `— ${yourName.split(" ")[0]}` : undefined,
            samples: samples || undefined,
            // The user's own description of their business — grounds every AI
            // message in what they actually sell, so it tailors to any vertical.
            business: describe.trim() || undefined,
          }),
        }).catch(() => {});
      }
      if (invites.trim()) {
        await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: invites }),
        }).catch(() => {});
      }
    } catch {
      setFinishing(false);
      // Turn the dead-end into a diagnosis: ask the health probe WHY a save fails
      // (most often the database isn't fully set up — missing tables or no
      // service-role key) so the owner sees the actual fix, not a generic error.
      let detail = " Check your connection and try again.";
      try {
        const h = await fetch("/api/health").then((r) => r.json());
        const blocker = h?.launch?.blockers?.[0];
        if (typeof blocker === "string" && blocker) detail = ` ${blocker}`;
        else detail = " Your workspace database may not be fully set up yet — if you're the owner, finish setup in Settings, otherwise contact your admin.";
      } catch { /* keep the connection-retry default */ }
      setSaveError(`We couldn't save your workspace.${detail}`);
      return;
    }
    // Brief "building your workspace" beat so finishing feels like the system coming alive.
    setTimeout(() => router.push("/dashboard"), 1150);
  }

  async function next() {
    if (step < steps.length - 1) { go(step + 1); return; }
    await finish();
  }

  return (
    // Full-bleed stage: the same layered material as the marketing/auth shells
    // (blueprint grid + brand glow), so onboarding feels like the same product
    // the landing page sold — not a bare form floating on a void.
    <div className="relative min-h-[100dvh]">
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-6 py-12">

      <div className="relative mb-8 flex items-center gap-2.5">
        <LogoBadge box={32} />
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
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Tell us about your business</h2>
                <p className="mt-1.5 text-sm text-muted">Describe what you do in a sentence or two — we&apos;ll personalize your whole workspace from it. Or skip and set it up by hand.</p>
                <textarea
                  className={`${input} mt-6`}
                  rows={4}
                  value={describe}
                  onChange={(e) => setDescribe(e.target.value)}
                  placeholder={"e.g. I run a real estate brokerage in Austin — we help buyers and sellers, mostly single-family homes."}
                  autoFocus
                />
                {personalized ? (
                  <div key={personalized.industryLabel} className="onb-fade mt-6 rounded-2xl border border-brand/30 bg-brand-soft/10 p-5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
                      <Icon name="autopilot" size={12} /> {personalized.ai ? "Personalized for you" : "Set up for you"}
                    </p>
                    <h3 className="mt-2 font-display text-lg font-semibold tracking-tight text-fg">Your workspace is ready</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex gap-3"><span className="w-24 shrink-0 text-muted">Industry</span><span className="text-fg">{personalized.industryLabel}</span></div>
                      {personalized.sells && <div className="flex gap-3"><span className="w-24 shrink-0 text-muted">You sell</span><span className="text-fg">{personalized.sells}</span></div>}
                      {org && <div className="flex gap-3"><span className="w-24 shrink-0 text-muted">Workspace</span><span className="text-fg">{org}</span></div>}
                      <div className="flex gap-3"><span className="w-24 shrink-0 text-muted">Pipeline</span><span className="text-fg">{tailoring.pipeline}</span></div>
                      <div className="flex gap-3"><span className="w-24 shrink-0 text-muted">Plays</span><span className="text-fg">{tailoring.plays}</span></div>
                    </div>
                    <p className="mt-3 text-xs text-muted">It&apos;s all set and editable anytime in Settings — your voice, team, and integrations included.</p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button onClick={finish} disabled={finishing} className="cta group inline-flex items-center gap-2 rounded-full bg-brand-strong py-2.5 pl-5 pr-2 text-sm font-semibold text-white hover:bg-brand-strong/90 disabled:opacity-70">
                        {finishing ? (
                          <span className="inline-flex items-center gap-2 pr-3"><svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg> Building your workspace…</span>
                        ) : (
                          <>Enter my workspace<span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></span></>
                        )}
                      </button>
                      <button onClick={() => go(1)} disabled={finishing} className="text-sm text-muted transition hover:text-fg disabled:opacity-50">Review &amp; customize</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center gap-3">
                    <button
                      onClick={personalize}
                      disabled={!describe.trim() || thinking}
                      className="cta inline-flex items-center gap-2 rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
                    >
                      {thinking ? (
                        <><svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg> Personalizing…</>
                      ) : (
                        <><Icon name="autopilot" size={15} /> Personalize my setup</>
                      )}
                    </button>
                    <button onClick={() => go(1)} disabled={thinking} className="text-sm text-muted transition hover:text-fg disabled:opacity-50">Skip — set up manually</button>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
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
                        <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ring-1 ring-inset transition ${active ? "bg-brand-strong text-white ring-white/15" : "bg-brand-soft text-brand ring-brand/20"}`}>
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

            {step === 2 && (
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
                      <optgroup label="Email, texts + live voice calls">
                        {LANGUAGES.filter((l) => l.voiceCall).map((l) => (
                          <option key={l.code} value={l.code}>{l.label} — {l.native}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Email + texts (live calls coming)">
                        {LANGUAGES.filter((l) => !l.voiceCall).map((l) => (
                          <option key={l.code} value={l.code}>{l.label} — {l.native}</option>
                        ))}
                      </optgroup>
                    </select>
                    <p className="mt-1 text-xs text-muted">Every email, text, and call script is written in this language — and spoken on live calls where supported.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
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
                  {/* The payoff moment: HEAR the call voice during setup. */}
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
                    <button
                      type="button"
                      onClick={hearVoice}
                      className="cta inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft/30 px-4 py-2 text-sm font-medium text-fg transition hover:bg-brand-soft/50"
                    >
                      <span className="grid h-5 w-5 place-items-center text-brand">
                        {hearState === "warming" ? (
                          <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                        ) : hearState === "playing" ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </span>
                      {hearState === "playing" ? "Stop" : "Hear how your calls will sound"}
                    </button>
                    <p className="min-w-0 flex-1 text-xs text-muted">
                      {hearState === "warming" ? "Warming up the voice — a few seconds the first time…" : "The actual voice your AI uses on the phone. Pick a different one anytime in Settings."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Invite your team</h2>
                <p className="mt-1.5 text-sm text-muted">Optional — add teammate emails, one per line. You can skip and do this later.</p>
                <textarea className={`${input} mt-6`} rows={5} aria-label="Email addresses to invite, one per line" value={invites} onChange={(e) => setInvites(e.target.value)} placeholder={"pat@acme.com\nrobin@acme.com"} />
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

      {saveError && (
        <p className="relative mt-6 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">{saveError}</p>
      )}

      <div className="relative mt-8 flex items-center justify-between">
        <button onClick={() => go(Math.max(0, step - 1))} disabled={step === 0 || finishing} className="cta inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></svg>
          Back
        </button>
        {step === 0 ? (
          <span /> /* step 0 has its own Personalize / Skip actions */
        ) : (
          <button onClick={next} disabled={finishing} className="cta group inline-flex items-center gap-2 rounded-full bg-brand-strong py-2 pl-5 pr-2 text-sm font-semibold text-white hover:bg-brand-strong/90 disabled:opacity-70">
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
        )}
      </div>
      <p className="relative mt-3 text-center text-[11px] text-muted">You can change any of this later in Settings.</p>
      </div>
    </div>
  );
}
