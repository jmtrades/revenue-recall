-- Per-org caller-ID / "from" number for outbound calls + SMS. Each org brings or
-- buys its OWN number(s) under the platform's telephony account, so the number a
-- call/text comes from is per-org — never one shared line. The app sends this as
-- the call's "from"; the gateway uses it (falling back to TWILIO_FROM_NUMBER).
alter table public.orgs add column if not exists caller_id text;
