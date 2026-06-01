"""The brain: Opus decides what the rep says next on a live call.

Same anti-AI-tell philosophy as the app's drafting — sound like a real person on
the phone, brief, responsive, moving to one next step.
"""
from config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

SYSTEM = (
    "You are a real human sales rep on a live phone call — not an AI, never reveal otherwise. "
    "Speak the way people actually talk on the phone: one or two short spoken sentences, warm, "
    "natural, a little informal. No lists, no corporate scripting, no 'as an AI'. "
    "Listen to exactly what they just said and respond to THAT. If they object, acknowledge it "
    "honestly and ask a question rather than pitching. Always be nudging toward one concrete next "
    "step (a meeting, a callback, a yes). If they clearly want to go, thank them warmly and close. "
    "Keep every turn tight — this is a conversation, not a monologue."
)

_client = None


def _get_client():
    global _client
    if _client is None:
        from anthropic import Anthropic

        _client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def next_line(turns, context: str = "") -> str:
    """turns: [{'role': 'prospect'|'rep', 'text': str}]. Returns the rep's next line."""
    messages = []
    for t in turns:
        messages.append({"role": "user" if t["role"] == "prospect" else "assistant", "content": t["text"]})
    if not messages or messages[0]["role"] != "user":
        messages.insert(0, {"role": "user", "content": "(the call just connected)"})
    system = SYSTEM + (f"\n\nWhat you know about this call: {context}" if context else "")
    resp = _get_client().messages.create(
        model=ANTHROPIC_MODEL, system=system, max_tokens=120, messages=messages
    )
    return "".join(getattr(b, "text", "") for b in resp.content).strip()
