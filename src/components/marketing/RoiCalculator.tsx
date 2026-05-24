"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// Growth per-seat monthly price used to frame ROI against plan cost.
const GROWTH_SEAT = 99;

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <div className="mt-1.5 flex items-center rounded-lg border border-border bg-bg px-3 focus-within:border-brand">
        {prefix && <span className="text-sm text-muted">{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-full bg-transparent py-2.5 text-sm text-white outline-none"
        />
      </div>
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-sm font-semibold text-white">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-brand"
      />
    </label>
  );
}

export function RoiCalculator() {
  const [reps, setReps] = useState(5);
  const [dealsPerRep, setDealsPerRep] = useState(20);
  const [avgDeal, setAvgDeal] = useState(4000);
  const [coldPct, setColdPct] = useState(30);
  const [recoverPct, setRecoverPct] = useState(20);

  const { recoveredMonth, recoveredYear, planCost, multiple } = useMemo(() => {
    const totalDeals = reps * dealsPerRep;
    const cold = totalDeals * (coldPct / 100);
    const recovered = cold * (recoverPct / 100);
    const recoveredMonth = recovered * avgDeal;
    const planCost = reps * GROWTH_SEAT;
    return {
      recoveredMonth,
      recoveredYear: recoveredMonth * 12,
      planCost,
      multiple: planCost > 0 ? recoveredMonth / planCost : 0,
    };
  }, [reps, dealsPerRep, avgDeal, coldPct, recoverPct]);

  return (
    <section id="roi" className="border-y border-border bg-surface/30">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">The cost of silence</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            How much revenue are you leaving on the table?
          </h2>
          <p className="mt-4 text-muted">
            Plug in your numbers. The deals quietly going cold add up fast — and most never get a second touch.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <div className="rounded-2xl border border-border bg-surface p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Sales reps" value={reps} onChange={setReps} min={1} max={1000} />
              <Field label="New deals / rep / month" value={dealsPerRep} onChange={setDealsPerRep} min={1} max={1000} />
            </div>
            <div className="mt-5">
              <Field label="Average deal value" value={avgDeal} onChange={setAvgDeal} min={1} max={10000000} step={100} prefix="$" />
            </div>
            <div className="mt-6 space-y-5">
              <Slider label="Deals that stall or go cold" value={coldPct} onChange={setColdPct} />
              <Slider label="Cold deals you win back with consistent follow-up" value={recoverPct} onChange={setRecoverPct} />
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-muted">
              Your numbers, your assumptions — adjust the win-back rate to whatever feels honest for your team.
              Revenue Recall&apos;s job is to push that number up by never letting a winnable deal go quiet.
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-brand/40 bg-surface p-7 ring-glow">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand">Recoverable revenue</p>
              <div className="mt-3 text-5xl font-semibold gradient-text">{money(recoveredMonth)}</div>
              <p className="mt-1 text-sm text-muted">per month · {money(recoveredYear)} / year</p>

              <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Revenue Recall (Growth, {reps} {reps === 1 ? "seat" : "seats"})</span>
                  <span className="text-white">{money(planCost)}/mo</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Return on that spend</span>
                  <span className="font-semibold text-success">
                    {multiple >= 1 ? `${multiple.toFixed(multiple >= 10 ? 0 : 1)}×` : "—"}
                  </span>
                </div>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-white">
                {multiple >= 1
                  ? `Recover just one of those deals and the platform has already paid for itself. At these numbers, Revenue Recall returns ${multiple.toFixed(multiple >= 10 ? 0 : 1)}× its cost.`
                  : "Even a single recovered deal a month tends to cover the platform several times over — bump the win-back rate to see it."}
              </p>
            </div>

            <Link
              href="/signup"
              className="mt-7 block rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand/90"
            >
              Start recovering it free — no card
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
