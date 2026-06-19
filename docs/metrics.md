# Metric definitions

The single source of truth for what every number in the product means. Each
metric is computed once, in the module named below, and consumed by every screen
that shows it — so the same metric reads identically everywhere. When you add or
change a metric, update this file and keep the math in its source module (never
recompute it per-page).

## Hard rules

- **Bounded ratios never exceed 100%.** Win rate, reply/click rate, and funnel
  stage conversion are clamped or bounded by construction. See
  `src/lib/tracking.ts` (`computeEngagement` clamps reply/click to ≤100%) and
  `src/components/charts.tsx` (`ProgressRing` clamps 0–1; `Funnel` caps stage
  conversion at 100%). Tested in `tests/engagement.test.ts` and `tests/stress.test.ts`.
- **Quota/goal attainment may exceed 100%** (you can beat your goal). It is only
  ever shown as a labelled "$X / $Y" figure or fed to the clamped `ProgressRing`
  (which caps the ring at full) — never as a raw >100% ring number.
- **Every currency/number renders through a formatter** — `money`,
  `compactMoney`, `pct` in `src/lib/format.ts`. No raw integers in the UI.

## Pipeline metrics — `src/lib/analytics.ts` (`computeMetrics`)

Computed from the org's opportunities + pipeline, consumed via `getOverview` and
`getReports` in `src/lib/queries.ts` (same inputs, so dashboard and reports agree).

| Metric | Definition | Bounds |
|---|---|---|
| Open Pipeline | Σ value of open (non-won, non-lost) opportunities | ≥0 |
| Weighted Forecast | Σ (open value × stage probability), rounded | ≥0 |
| Won value / count | Σ value / count of opportunities in a `won` stage | ≥0 |
| Win Rate | won ÷ (won + lost) | 0–100% |
| Avg deal size | won value ÷ won count | ≥0 |

**Window note:** the dashboard "Won This Month" shows the latest month bucket
from `reports.monthlyWon`; the Reports "Closed Won" shows all-time `wonValue`.
Both derive from the same `getReports()` source — they are different *windows* of
one metric, not contradictory figures.

## Recall — `src/lib/recall/engine.ts`

| Metric | Definition | Source |
|---|---|---|
| Recoverable | probability-weighted value of at-risk deals currently in the queue | `summarizeRecall` / `buildRecallQueue` |
| Recalled ("deals worked") | distinct deals enrolled/recovered by the recall effort | `computeRecallOutcomes` |
| Won back / recovered value | deals re-won after a recall touch | `computeRecallOutcomes` |

`getOverview` (dashboard hero), `getRecallQueue` (recall page), `getCallQueue`
(dialer — callable recall deals with a phone number) and `getReports` all read
these, so the recoverable total and recalled count match across those screens.

## Outreach engagement — `src/lib/tracking.ts` (`computeEngagement`)

30-day rollup of `message_events`.

| Metric | Definition | Bounds |
|---|---|---|
| Sent | count of `sent` events | ≥0 |
| Reply rate | replied ÷ sent, **clamped to 100%** | 0–100% |
| Click rate | clicked ÷ sent, **clamped to 100%** | 0–100% |

Replies/clicks are separate event streams from sends (a contact can reply more
than once), so the raw ratio can exceed 1 — it is clamped because a rate is
bounded by definition.

## Autopilot summary — `src/lib/agent/summary.ts` (`summarizeRuns`)

Rolls up the recent run ledger. **These measure cumulative agent activity and are
deliberately distinct from the recall queue's current-state numbers** — they are
deduped by deal so they cannot contradict recall by double-counting.

| Metric | Definition |
|---|---|
| Active agents | enabled autopilot tasks |
| Deals worked | **distinct** deals the agent actually actioned (deduped by id; skipped/quiet-hours/opted-out evaluations don't count) |
| Actions taken | total touches across runs (includes skips) |
| Recoverable touched | recoverable value of those distinct worked deals, counted once each |

"Deals worked" here ≠ recall's "Recalled": recall counts the current at-risk
queue; autopilot counts distinct deals it has worked across recent runs. Both are
correct; they answer different questions.

## Funnel & quota — `src/components/charts.tsx`

- **Funnel** stage conversion = countAtStage ÷ countAtPreviousStage, capped at
  100%. Bar width scales to the largest stage.
- **Quota attainment** (dashboard "Monthly goal", forecast quota ring) =
  wonThisMonth ÷ monthlyQuota. May exceed 100%; rendered only via the clamped
  `ProgressRing` plus a "$X / $Y" label.
