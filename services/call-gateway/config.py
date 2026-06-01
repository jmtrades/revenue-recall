"""Configuration, all from env — nothing hard-coded, nothing leaves your infra."""
import os


def env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


# Your in-house voice (the neural-voice service) — WebSocket URL.
NEURAL_VOICE_URL = env("NEURAL_VOICE_URL")
# Your Opus brain.
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", "claude-opus-4-8")
# Your speech-to-text (local, open model).
WHISPER_MODEL = env("WHISPER_MODEL", "base.en")
WHISPER_DEVICE = env("WHISPER_DEVICE", "cpu")  # "cuda" for GPU
# Your FreeSWITCH (call control + media).
FREESWITCH_ESL_HOST = env("FREESWITCH_ESL_HOST", "127.0.0.1")
FREESWITCH_ESL_PORT = int(env("FREESWITCH_ESL_PORT", "8021"))
# No default — set this to your FreeSWITCH ESL password (never hard-code one).
FREESWITCH_ESL_PASSWORD = env("FREESWITCH_ESL_PASSWORD")
# Your SIP trunk (the only outside line) — the gateway name configured in FreeSWITCH.
SIP_TRUNK_GATEWAY = env("SIP_TRUNK_GATEWAY", "")
CALLER_ID = env("OUTBOUND_FROM_NUMBER", "")
# Shared secret the app signs its webhook with (COMMS_WEBHOOK_TOKEN in the app).
COMMS_WEBHOOK_TOKEN = env("COMMS_WEBHOOK_TOKEN")
# Where FreeSWITCH reaches us back for media (audio_fork target).
PUBLIC_WS_BASE = env("PUBLIC_WS_BASE", "ws://127.0.0.1:8080")

# Telephony media is 8 kHz mono PCM; our neural voice emits 24 kHz (we resample).
TELEPHONY_SAMPLE_RATE = 8000
