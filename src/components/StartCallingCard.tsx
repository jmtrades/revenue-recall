import Link from "next/link";
import { Icon } from "@/components/icons";

/**
 * The unmistakable "here's how to call" surface. Calling was the one thing users
 * kept saying was unclear, so this spells out the fastest path (the Power Dialer)
 * and the two other ways to dial, with one obvious button. Shown on the Dashboard
 * until the first dial of the day (then the dials-today pulse takes over) and in
 * the first-run welcome, so a new user never has to wonder where calling lives.
 */
const WAYS = [
  { icon: "dialer" as const, title: "Power Dialer", body: "Your leads queued for back-to-back calling, with AI prep on each one." },
  { icon: "play" as const, title: "“Call now” on a deal", body: "Open any deal or the Recall queue and dial it on the spot." },
  { icon: "autopilot" as const, title: "Autopilot", body: "Let it call, email, and text on its own — within your rules." },
];

export function StartCallingCard({ className = "" }: { className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-brand/25 bg-surface p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
            <Icon name="dialer" size={14} /> Start calling
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-fg">Ready to make calls?</h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
            The Power Dialer lines up your leads — cold and slipping deals first — for back-to-back calling in a natural,
            human-sounding voice, with every outcome logged for you.
          </p>
        </div>
        <Link
          href="/dialer"
          className="inline-flex flex-none items-center gap-2 rounded-xl bg-brand-strong px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong/90 active:scale-[0.98]"
        >
          <Icon name="dialer" size={16} /> Open the Power Dialer <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {WAYS.map((w) => (
          <div key={w.title} className="rounded-xl border border-border bg-surface-2/50 p-3.5">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon name={w.icon} size={14} />
              </span>
              {w.title}
            </span>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{w.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
