"""House voice id → ElevenLabs voice id (kept 1:1 with the app's ELEVEN_VOICES in
src/lib/voice/tts.ts). The app stores a chosen voice as a house id (e.g. "am_adam")
or an "eleven:<id>" clone; this resolves either to the real ElevenLabs voice id the
call gateway speaks in. Pure stdlib so the orchestration layer/tests load clean."""

ELEVEN_PREFIX = "eleven:"

# 1:1 with HOUSE_VOICES — each is a DISTINCT premade ElevenLabs voice.
HOUSE_TO_ELEVEN = {
    "af_heart": "9BWtsMINqrJLrRacOk9x",   # Aria
    "af_sarah": "EXAVITQu4vr4xnSDxMaL",   # Sarah
    "af_nicole": "FGY2WhTYpPnrIDTdsKH5",  # Laura
    "af_nova": "XB0fDUnXU5powFXDhCwa",    # Charlotte
    "af_jessica": "cgSgspJ2msm6clMCkdW9", # Jessica
    "af_river": "SAz9YHcvj6GT2YYXdXww",   # River
    "af_sky": "XrExE9yKIg1WjnnlVkGX",     # Matilda
    "am_adam": "nPczCjzI2devNBz1zQrb",    # Brian
    "am_michael": "CwhRBWXzGAHq8TQ4Fs17", # Roger
    "am_onyx": "pqHfZKP75CvOlQylNhV4",    # Bill
    "am_eric": "cjVigY5qzO86Huf0OWal",    # Eric
    "am_liam": "TX3LPaxmHKxFdv7VOQHJ",    # Liam
    "am_echo": "bIHbv24MWmeRgasZH58o",    # Will
    "am_fenrir": "iP95p4xoKVk53GoZ742B",  # Chris
    "am_puck": "N2lVS1w4EtoT3dr4eOWO",    # Callum
    "bf_emma": "Xb7hH8MSUJpSbSDYk0k2",    # Alice
    "bf_lily": "pFZP5JQG7iQjIQuC4Bku",    # Lily
    "bm_george": "JBFqnCBsd6RMkjVDRZzb",  # George
    "bm_daniel": "onwK4e9ZLuTAKqWW03F9",  # Daniel
}

DEFAULT_HOUSE = "af_heart"
# Gender/accent-aware default within the mapped set — an unmapped house voice
# still resolves to a voice of the SAME group, never a mismatched one.
_GROUP_DEFAULT = {"am": "am_adam", "bf": "bf_emma", "bm": "bm_george"}


def eleven_voice(voice_id=None, fallback=None):
    """Resolve a house voice id (or 'eleven:<id>' clone, or None) to an ElevenLabs
    voice id. `fallback` is the operator's configured default (ELEVENLABS_VOICE_ID)."""
    default = fallback or HOUSE_TO_ELEVEN[DEFAULT_HOUSE]
    if not voice_id:
        return default
    if voice_id.startswith(ELEVEN_PREFIX):
        return voice_id[len(ELEVEN_PREFIX):] or default
    if voice_id in HOUSE_TO_ELEVEN:
        return HOUSE_TO_ELEVEN[voice_id]
    # Unmapped house id → the matching group's default voice (same gender/accent).
    grp = _GROUP_DEFAULT.get(voice_id[:2], DEFAULT_HOUSE)
    return HOUSE_TO_ELEVEN.get(grp, default)
