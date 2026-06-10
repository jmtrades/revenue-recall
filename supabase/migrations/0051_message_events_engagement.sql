-- Outreach engagement: record 'sent' and 'reply' alongside 'click' in
-- message_events, so Reports can show the sent -> clicked -> replied funnel and
-- reply rate (the north-star outbound metric). 'sent'/'reply' rows have no url.
-- Idempotent.
alter table message_events drop constraint if exists message_events_kind_check;
alter table message_events add constraint message_events_kind_check
  check (kind in ('click','sent','reply'));

alter table message_events alter column url drop not null;

-- The engagement rollups count by kind over a window.
create index if not exists idx_message_events_kind on message_events(org_id, kind, created_at);
