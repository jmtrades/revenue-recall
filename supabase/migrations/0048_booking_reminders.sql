-- Booking reminders: a per-booking flag so the cron sends each invitee exactly
-- one reminder before their meeting (no-shows are the biggest leak in booked
-- pipeline). Idempotent.
alter table bookings add column if not exists reminder_sent boolean not null default false;

-- The reminder scan reads confirmed, not-yet-reminded bookings starting soon.
create index if not exists idx_bookings_reminder on bookings(org_id, reminder_sent, starts_at)
  where status = 'confirmed';
