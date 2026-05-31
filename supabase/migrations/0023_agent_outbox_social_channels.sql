-- Allow social channels in the approval outbox.
-- The two-way social work lets an inbound DM's AI-drafted reply queue to
-- Approvals on its own platform (whatsapp/instagram/messenger/telegram/x/
-- linkedin), and the approve route sends it back out via the unified seam.
-- The original agent_outbox.channel CHECK only allowed ('email','sms'), so a
-- queued social reply would violate the constraint. Widen it to match
-- OutboxChannel in the code. Idempotent: drop + re-add.

alter table agent_outbox drop constraint if exists agent_outbox_channel_check;
alter table agent_outbox
  add constraint agent_outbox_channel_check
  check (channel in ('email','sms','whatsapp','instagram','messenger','telegram','x','linkedin'));
