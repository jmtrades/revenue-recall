"""The brain: Opus decides what the rep says next on a live call.

Same anti-AI-tell philosophy as the app's drafting — sound like a real person on
the phone, brief, responsive, moving to one next step.
"""
import re

from config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

SYSTEM = (
    "You are an AI assistant calling on behalf of the sales team — speak naturally and warmly like "
    "a real person on the phone, but if they ask whether you're a person, a bot, or AI, answer "
    "honestly and briefly (e.g. 'I'm an AI assistant with the team') and carry on — never claim to "
    "be human and never deny being an AI. (State bot-disclosure laws and the FCC's AI-voice rules "
    "require this; the call also opens with a spoken disclosure.) "
    "Speak the way people actually talk on the phone: one or two short spoken sentences, warm, "
    "natural, a little informal. No lists, no corporate scripting. "
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
_async_client = None


def _get_client():
    global _client
    if _client is None:
        from anthropic import Anthropic

        _client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def _get_async_client():
    global _async_client
    if _async_client is None:
        from anthropic import AsyncAnthropic

        _async_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _async_client


def _build(turns, context: str, wrap: bool):
    """Shared request shape for the sync and streaming paths."""
    messages = []
    for t in turns:
        messages.append({"role": "user" if t["role"] == "prospect" else "assistant", "content": t["text"]})
    if not messages or messages[0]["role"] != "user":
        messages.insert(0, {"role": "user", "content": "(the call just connected)"})
    system = SYSTEM + (f"\n\nWhat you know about this call: {context}" if context else "") + (WRAP_DIRECTIVE if wrap else "")
    return system, messages


# A sentence ends at . ! or ? followed by whitespace or end-of-text. We keep the
# terminator and emit each complete sentence the moment it's finished, so TTS can
# start speaking it while the model is still generating the rest.
_SENTENCE_END = re.compile(r"[.!?]+(?=\s|$)")


def split_complete_sentences(buf: str):
    """Split a growing reply buffer into (finished_sentences, leftover_partial).

    Pure + tested. Only returns sentences whose terminator is followed by
    whitespace or the end of the buffer, so a partial sentence still streaming in
    is held back in `leftover` until it's complete (or flushed at stream end)."""
    sentences = []
    last = 0
    for m in _SENTENCE_END.finditer(buf):
        end = m.end()
        # Don't emit a terminator that sits at the very end with no trailing space:
        # more text may still arrive (e.g. "3.14"). Held in leftover until we see
        # whitespace after it or the stream ends.
        if end >= len(buf):
            break
        s = buf[last:end].strip()
        if s:
            sentences.append(s)
        last = end
    return sentences, buf[last:]


def next_line(turns, context: str = "", wrap: bool = False) -> str:
    """turns: [{'role': 'prospect'|'rep', 'text': str}]. Returns the rep's next line.

    wrap=True forces a graceful close (used once the call hits the turn cap), so a
    stubborn back-and-forth always ends instead of looping until the prospect hangs up.
    """
    system, messages = _build(turns, context, wrap)
    resp = _get_client().messages.create(
        model=ANTHROPIC_MODEL, system=system, max_tokens=120, messages=messages
    )
    return "".join(getattr(b, "text", "") for b in resp.content).strip()


async def stream_lines(turns, context: str = "", wrap: bool = False):
    """Async generator yielding the rep's reply ONE SENTENCE AT A TIME as the model
    produces it, so the agent can start synthesizing/speaking the first sentence
    instead of waiting for the whole reply — the single biggest cut to on-call dead
    air. Native async streaming keeps the event loop free, so concurrent calls' media
    keeps flowing. Any trailing partial is flushed when the stream ends."""
    system, messages = _build(turns, context, wrap)
    buf = ""
    async with _get_async_client().messages.stream(
        model=ANTHROPIC_MODEL, system=system, max_tokens=120, messages=messages
    ) as stream:
        async for delta in stream.text_stream:
            buf += delta
            done, buf = split_complete_sentences(buf)
            for sentence in done:
                yield sentence
    tail = buf.strip()
    if tail:
        yield tail
