-- Billing subscriptions, one row per org. Populated by Stripe Checkout
-- completion and kept in sync by the Stripe webhook. Orgs with no row are
-- treated as the free plan. The Stripe ids let the webhook map events back to
-- the right org.

create table if not exists subscriptions (
  org_id                 uuid primary key references orgs(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free','growth','scale')),
  status                 text not null default 'none' check (status in ('none','trialing','active','past_due','canceled')),
  seats                  int not null default 1,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists idx_subscriptions_customer on subscriptions(stripe_customer_id);

alter table subscriptions enable row level security;
drop policy if exists org_rw_subscriptions on subscriptions;
create policy org_rw_subscriptions on subscriptions
  using (org_id = current_org_id()) with check (org_id = current_org_id());
