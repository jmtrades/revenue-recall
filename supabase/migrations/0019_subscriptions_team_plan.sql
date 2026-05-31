-- Allow the 'team' plan on subscriptions.
-- The plan catalog (src/lib/billing/plans.ts) sells four tiers — free, growth,
-- team, scale — and Stripe maps STRIPE_PRICE_TEAM -> 'team'. The original
-- subscriptions table (0012) only permitted ('free','growth','scale'), so a
-- paying team-plan customer's webhook write hit the CHECK constraint and the
-- subscription silently failed to activate. Widen the constraint to match the
-- code. Idempotent: safe to re-run.

alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions
  add constraint subscriptions_plan_check check (plan in ('free','growth','team','scale'));
