-- Per-rep booking / scheduling link (Calendly, Cal.com, SavvyCal, etc.). When
-- set, the AI offers this exact link so prospects can self-schedule a call —
-- closing the loop from "interested reply" to a booked meeting without the rep
-- playing calendar tag. Optional and only injected when proposing a meeting.
alter table public.personas add column if not exists booking_url text;
