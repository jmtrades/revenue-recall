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
    "honestly and ask a question rather than pitching — but NEVER re-explain the same objection "
    "more than once. If the same concern comes back, or the call is dragging, STOP pitching: "
    "propose ONE specific next step (a callback at a set time) or offer to send a single proof, "
    "then warmly wrap. Always nudge toward one concrete next step. If they clearly want to go, "
    "thank them warmly and close. Resolve it in a few tight exchanges — never loop."
)

# Appended when the call has run long enough that we must wrap now.
WRAP_DIRECTIVE = (
    " This call has gone on long enough. Do NOT pitch or ask another discovery question — warmly "
    "propose one specific next step (a callback time) or a single proof to send, and close now."
)

_client = None


def _get_client():
    global _client
    if _client is None:
        from anthropic import Anthropic

        _client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def next_line(turns, context: str = "", wrap: bool = False) -> str:
    """turns: [{'role': 'prospect'|'rep', 'text': str}]. Returns the rep's next line.

    wrap=True forces a graceful close (used once the call hits the turn cap), so a
    stubborn back-and-forth always ends instead of looping until the prospect hangs up.
    """
    messages = []
    for t in turns:
        messages.append({"role": "user" if t["role"] == "prospect" else "assistant", "content": t["text"]})
    if not messages or messages[0]["role"] != "user":
        messages.insert(0, {"role": "user", "content": "(the call just connected)"})
    system = SYSTEM + (f"\n\nWhat you know about this call: {context}" if context else "") + (WRAP_DIRECTIVE if wrap else "")
    resp = _get_client().messages.create(
        model=ANTHROPIC_MODEL, system=system, max_tokens=120, messages=messages
    )
    return "".join(getattr(b, "text", "") for b in resp.content).strip()
