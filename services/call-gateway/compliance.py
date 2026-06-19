"""In-call compliance helpers for the live phone agent.

The app gates an outbound call on consent BEFORE it's placed (hasCallConsent,
quiet hours, prior opt-out). This covers the other half: a prospect who asks to
be left alone DURING the call must be honored immediately — the agent stops
pitching, acknowledges, and hangs up, and the app persists a durable do-not-
contact so they're never dialed again. Stdlib-only so the agent stays dep-free.
"""
import re

# Clear do-not-contact / opt-out requests. Deliberately conservative: a soft
# "not interested / not right now" is an objection the brain handles, NOT an
# opt-out, so it's intentionally excluded here. We only short-circuit the call on
# an unambiguous request to stop being contacted.
_OPT_OUT = re.compile(
    r"(?ix)\b("
    r"(do\s*not|don'?t|stop|quit|no\s+more|never)\s+"
    r"(calls?|calling|contacts?|contacting|phon(e|es|ing)|texts?|texting|messages?|messaging)"
    r"|take\s+me\s+off"
    r"|remove\s+(me|my\s+(number|name|info|details|contact))"
    r"|lose\s+my\s+number"
    r"|leave\s+me\s+alone"
    r"|unsubscribe"
    r"|opt(\s|-)?(me\s+)?out"
    r")\b"
)

# A bare "stop" as essentially the whole utterance is an opt-out (the SMS "STOP"
# convention, spoken). Required as a standalone so it doesn't fire on "don't
# stop" or "stop by the office".
_BARE_STOP = {"stop", "stop it", "stop please", "please stop", "just stop"}


def is_opt_out(text: str) -> bool:
    """True when the prospect clearly asked not to be contacted."""
    t = (text or "").strip().lower()
    if not t:
        return False
    if t.rstrip(" .!?") in _BARE_STOP:
        return True
    return bool(_OPT_OUT.search(t))
