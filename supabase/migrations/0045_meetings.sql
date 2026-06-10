-- Native meetings / booking.
--
-- Closes the outbound loop: a prospect who replies can self-serve a time on a
-- public, token-authed booking page (/book/[org]), which creates a contact +
-- open deal + a "meeting" activity and notifies the rep — no Calendly, no
-- round-trip. Three org-scoped tables, all idempotent + RLS like every other
-- tenant table (org_rw_<table> using current_org_id()).

-- A bookable meeting kind (e.g. "Intro call", 30 min). Optional: the public page
-- falls back to a synthesized default when an org has configured none, so the
-- booking flow works out of the box.
create table if not exists meeting_types (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  name             text not null,
  slug             text not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  description      text,
  -- where the meeting happens: phone | video | in_person | custom (+ free detail)
  location_kind    text not null default 'phone' check (location_kind in ('phone','video','in_person','custom')),
  location_detail  text,
  enabled          boolean not null default true,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists idx_meeting_types_org on meeting_types(org_id, enabled, created_at);

alter table meeting_types enable row level security;
drop policy if exists org_rw_meeting_types on meeting_types;
create policy org_rw_meeting_types on meeting_types
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- One weekly availability schedule per org (when slots may be offered). Stored as
-- JSONB keyed by weekday 0..6 (Sun..Sat) → array of {start,end} "HH:MM" windows in
-- the org's timezone. min_notice_minutes is the soonest a slot may be booked from
-- now; horizon_days is how far ahead slots are offered.
create table if not exists booking_availability (
  org_id             uuid primary key references orgs(id) on delete cascade,
  timezone           text not null default '',
  weekly             jsonb not null default '{}'::jsonb,
  slot_minutes       integer not null default 30 check (slot_minutes between 5 and 240),
  min_notice_minutes integer not null default 240 check (min_notice_minutes >= 0),
  horizon_days       integer not null default 14 check (horizon_days between 1 and 90),
  updated_at         timestamptz not null default now()
);

alter table booking_availability enable row level security;
drop policy if exists org_rw_booking_availability on booking_availability;
create policy org_rw_booking_availability on booking_availability
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- A confirmed (or cancelled) booking. contact_id / deal_id are soft text refs to
-- whichever CRM backend the org uses (built-in uuids or an external CRM's ids), so
-- the record survives a meeting_type being deleted later (name + duration are
-- snapshotted on the row). starts_at/ends_at are absolute UTC instants.
create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  meeting_type_id  uuid references meeting_types(id) on delete set null,
  meeting_name     text not null,
  duration_minutes integer not null,
  contact_id       text,
  deal_id          text,
  invitee_name     text not null,
  invitee_email    text,
  invitee_phone    text,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  timezone         text not null default '',
  status           text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  notes            text,
  created_at       timestamptz not null default now()
);

-- Lookups for the slot-conflict query (open bookings in a time range) and the
-- per-org list, both ordered by start.
create index if not exists idx_bookings_org_start on bookings(org_id, starts_at);
create index if not exists idx_bookings_org_status_start on bookings(org_id, status, starts_at);

alter table bookings enable row level security;
drop policy if exists org_rw_bookings on bookings;
create policy org_rw_bookings on bookings
  using (org_id = current_org_id()) with check (org_id = current_org_id());
