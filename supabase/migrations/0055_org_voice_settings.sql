-- Per-org read-aloud voice tuning for the hosted (ElevenLabs) voice: speaking
-- speed and expressiveness. Stored as a small JSON blob alongside the chosen
-- voice (orgs.tts_voice_id), mirroring the other per-org jsonb settings. Empty
-- {} = provider defaults. Idempotent.
alter table orgs add column if not exists voice_settings jsonb not null default '{}'::jsonb;
