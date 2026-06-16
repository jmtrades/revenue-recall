"""Configuration, all from env — nothing hard-coded, nothing leaves your infra."""
import os


def env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


# Your in-house voice (the neural-voice service) — WebSocket URL. If NEURAL_VOICE_URL
# isn't set directly, build it from NEURAL_VOICE_HOST/PORT (lets Render's
# fromService auto-wire the gateway to the private neural-voice service).
NEURAL_VOICE_URL = env("NEURAL_VOICE_URL")
if not NEURAL_VOICE_URL and env("NEURAL_VOICE_HOST"):
    NEURAL_VOICE_URL = f"ws://{env('NEURAL_VOICE_HOST')}:{env('NEURAL_VOICE_PORT', '8765')}"
# Your Opus brain.
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", "claude-opus-4-8")
# Your speech-to-text (local, open model). small.en is the quality-first default —
# markedly more accurate than base.en on names, numbers and noisy phone audio (the
# details that decide a sales call) while still real-time on a modest CPU. On GPU
# (WHISPER_DEVICE=cuda) step up to WHISPER_MODEL=large-v3 for the best accuracy.
WHISPER_MODEL = env("WHISPER_MODEL", "small.en")
WHISPER_DEVICE = env("WHISPER_DEVICE", "cpu")  # "cuda" for GPU
# Your FreeSWITCH (call control + media).
FREESWITCH_ESL_HOST = env("FREESWITCH_ESL_HOST", "127.0.0.1")
FREESWITCH_ESL_PORT = int(env("FREESWITCH_ESL_PORT", "8021"))
# No default — set this to your FreeSWITCH ESL password (never hard-code one).
FREESWITCH_ESL_PASSWORD = env("FREESWITCH_ESL_PASSWORD")
# Your SIP trunk (the only outside line) — the gateway name configured in FreeSWITCH.
SIP_TRUNK_GATEWAY = env("SIP_TRUNK_GATEWAY", "")
CALLER_ID = env("OUTBOUND_FROM_NUMBER", "")
# ── Twilio path (fastest way live — no FreeSWITCH) ──────────────────────────
# When these are set, the gateway places calls via Twilio's REST API and bridges
# call audio over Twilio Media Streams to the in-house agent. Twilio is just the
# dial-tone + number (the one unavoidable carrier); STT, brain, and voice stay
# in-house. Leave unset to use the FreeSWITCH/SIP-trunk path above instead.
TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = env("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = env("TWILIO_FROM_NUMBER")
# Public wss:// URL of THIS gateway, reachable by Twilio (e.g. wss://calls.acme.com).
PUBLIC_WSS_BASE = env("PUBLIC_WSS_BASE")

# ── Answering-machine detection (Twilio AMD) ────────────────────────────────
# OFF by default — enabling it adds AMD to every outbound Twilio call and POSTs
# the verdict to /twilio/amd, so a call that hits voicemail is logged as
# 'voicemail' (driving the app's voicemail follow-up + retry) instead of being
# mislabeled 'no-answer'. https://www.twilio.com/docs/voice/answering-machine-detection
AMD_ENABLED = env("AMD_ENABLED", "").lower() in ("1", "true", "yes")
AMD_TIMEOUT_SEC = int(env("AMD_TIMEOUT_SEC", "30"))
# HTTPS base for Twilio status callbacks (Twilio POSTs AMD here). Defaults from
# PUBLIC_WSS_BASE (wss→https) so it auto-wires when the gateway is reachable.
PUBLIC_HTTPS_BASE = env("PUBLIC_HTTPS_BASE")
if not PUBLIC_HTTPS_BASE and PUBLIC_WSS_BASE:
    PUBLIC_HTTPS_BASE = PUBLIC_WSS_BASE.replace("wss://", "https://").replace("ws://", "http://")


def twilio_ready() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER and PUBLIC_WSS_BASE)


# Shared secret the app signs its webhook with (COMMS_WEBHOOK_TOKEN in the app).
COMMS_WEBHOOK_TOKEN = env("COMMS_WEBHOOK_TOKEN")
# Where we POST each finished call's transcript + outcome so the app logs it to
# the CRM timeline (the app's /api/calls/log). Unset → calls aren't logged back.
CALL_STATUS_WEBHOOK_URL = env("CALL_STATUS_WEBHOOK_URL")
# Optional URL where call recordings are hosted, echoed into the call log.
# Where FreeSWITCH reaches us back for media (audio_fork target).
PUBLIC_WS_BASE = env("PUBLIC_WS_BASE", "ws://127.0.0.1:8080")

# Spoken at the very top of EVERY outbound AI call — bot/AI disclosure required by
# state bot-disclosure laws and the FCC's AI-voice rules. Default ON; set
# CALL_AI_DISCLOSURE="" only if you disclose another way. (The call-recording
# consent disclosure is separate — configured in the app as CALL_RECORDING_DISCLOSURE.)
CALL_AI_DISCLOSURE = env(
    "CALL_AI_DISCLOSURE",
    "Quick heads up — this is an AI assistant calling on behalf of the team.",
)

# Telephony media is 8 kHz mono PCM; our neural voice emits 24 kHz (we resample).
TELEPHONY_SAMPLE_RATE = 8000
