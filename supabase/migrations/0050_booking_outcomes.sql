-- Booking outcomes: a rep can mark a meeting completed or a no-show (the latter
-- feeds the no-show rate in Reports). Widen the status check; idempotent.
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('confirmed','cancelled','completed','no_show'));
