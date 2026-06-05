"""Answering-machine detection (AMD) — pure, dependency-free classification of
Twilio's `AnsweredBy`, kept here (and unit-tested) so call-outcome labeling and
the voicemail decision are correct regardless of the live telephony wiring.

Twilio AMD reference: AnsweredBy is one of
  human | machine_start | machine_end_beep | machine_end_silence |
  machine_end_other | fax | unknown
With MachineDetection=DetectMessageEnd, a machine resolves to one of the
machine_end_* values once its greeting finishes (i.e. ready for a message)."""
import hashlib
import hmac

_MACHINE = {"machine_start", "machine_end_beep", "machine_end_silence", "machine_end_other"}
# A message can be left only AFTER the greeting ends (the machine_end_* states);
# machine_start means "it's a machine, greeting still playing" — too early to talk.
_READY_FOR_MESSAGE = {"machine_end_beep", "machine_end_silence", "machine_end_other"}


def _norm(answered_by) -> str:
    return str(answered_by or "").strip().lower()


def classify(answered_by) -> str:
    """Normalize Twilio's AnsweredBy into: human | machine | fax | unknown."""
    v = _norm(answered_by)
    if v in _MACHINE:
        return "machine"
    if v == "human":
        return "human"
    if v == "fax":
        return "fax"
    return "unknown"


def is_machine(answered_by) -> bool:
    """True when AMD concluded a machine/voicemail answered the call."""
    return _norm(answered_by) in _MACHINE


def ready_for_voicemail(answered_by) -> bool:
    """True once a machine's greeting has ended — the moment to leave a message."""
    return _norm(answered_by) in _READY_FOR_MESSAGE


def call_outcome(answered_by, heard_prospect: bool) -> str:
    """The outcome string to log to the CRM. AMD is authoritative when present —
    a machine answer is 'voicemail' even if our STT 'heard' the greeting, and a
    human answer is 'completed'. Without an AMD verdict, fall back to the
    heard-a-prospect heuristic the gateway used before AMD. The 'voicemail' value
    is what the app's retry/voicemail-follow-up logic keys on."""
    c = classify(answered_by)
    if c == "machine":
        return "voicemail"
    if c == "fax":
        return "fax"
    if c == "human":
        return "completed"
    return "completed" if heard_prospect else "no-answer"


def amd_token(call_id: str, secret: str) -> str:
    """Per-call token for the async-AMD status callback URL, so the (otherwise
    unauthenticated) /twilio/amd endpoint can't be spoofed to mislabel a call.
    HMAC-SHA256(call_id) under the shared webhook secret, hex, 32 chars."""
    if not secret:
        return ""
    return hmac.new(secret.encode("utf-8"), call_id.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
