-- Per-org hosted (ElevenLabs) read-aloud voice. Distinct from orgs.voice_id,
-- which is the in-house Kokoro voice the call-gateway speaks in: this is the
-- voice the hosted neural TTS (lib/voice/tts.ts → ElevenLabs) uses for every
-- read-aloud / preview surface, and it can be a stock ElevenLabs voice or the
-- org's own cloned voice. Stored as "eleven:<voiceId>" so the provider is
-- explicit; null = the provider/account default. Idempotent like every migration.
alter table orgs add column if not exists tts_voice_id text;
