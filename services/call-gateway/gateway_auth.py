"""Authorization helpers for the call gateway.

Kept deliberately dependency-free (no numpy / aiohttp / fastapi) so it imports and
runs under the stdlib-only test runner — the security decision is the part most
worth unit-testing, and it shouldn't drag heavy call-path deps into the tests.
"""
import os


def _insecure_bypass() -> bool:
    """Local-dev escape hatch, same convention as the /voice + /twilio/amd guards."""
    return os.environ.get("GATEWAY_ALLOW_INSECURE", "").lower() in ("1", "true", "yes")


def media_authorized(call_id, pending) -> bool:
    """Is this media-WebSocket connection allowed to run a live agent?

    A media stream is authorized iff its `call_id` is a call WE just originated —
    i.e. present in `pending`. The id is a 128-bit random token minted in /voice and
    handed ONLY to the carrier (Twilio TwiML <Parameter> / the FreeSWITCH wss URL),
    so "known + in-flight" is an effective bearer credential. It is also single-use:
    the handler pops it on the first (legitimate) connect, so a replay can't run a
    second agent on the same id.

    Without this check, an unknown/empty id falls through to `_pending.pop(id, {})`
    and the gateway happily spins up a full paid live agent (Whisper STT → Opus brain
    → ElevenLabs TTS) for any anonymous WebSocket — an unauthenticated cost-burn /
    eavesdrop / audio-injection vector on a public endpoint.

    GATEWAY_ALLOW_INSECURE=true bypasses the check for local FreeSWITCH testing.
    """
    if call_id and call_id in pending:
        return True
    return _insecure_bypass()
