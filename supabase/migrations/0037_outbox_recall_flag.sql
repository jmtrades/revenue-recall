-- Attribution accuracy: tag a queued draft that originated from a recall effort
-- so a recall "touch" is recorded only when the draft is actually SENT (approved),
-- not when it's queued to Approvals. A queued-but-never-approved recall draft must
-- not inflate recovered-revenue attribution.
alter table agent_outbox add column if not exists recall boolean not null default false;
