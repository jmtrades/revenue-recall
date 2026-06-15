-- Global "pause all autonomous sending" kill switch, per org. When true, the
-- autopilot and sequence cadences hold every send (drafts queue to Approvals)
-- instead of going out — the panic brake for an agent that acts on the user's
-- behalf. Default false (sending proceeds as before).
alter table orgs add column if not exists sending_paused boolean not null default false;
