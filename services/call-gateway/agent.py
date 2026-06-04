"""The live-call agent: listen → think → speak, with barge-in. Pure orchestration
over the STT / brain / TTS seams and a media transport — fully in-house."""
import asyncio

from brain import next_line
from stt import transcribe
from tts import synthesize
from config import TELEPHONY_SAMPLE_RATE

DEFAULT_OPENER = "Hey, it's me — caught you at an okay time?"

# Hard ceiling on rep turns. The brain already wraps a repeated objection on its
# own; this is the backstop so a live call can NEVER loop indefinitely — at the
# cap we force one graceful closing line and hang up.
MAX_REP_TURNS = 12


class CallAgent:
    def __init__(self, context: str = "", voice_id=None, opener: str = DEFAULT_OPENER):
        self.turns = []
        self.context = context
        self.voice_id = voice_id
        self.opener = opener

    async def _speak(self, text: str, transport):
        async for chunk in synthesize(text, voice_id=self.voice_id, sample_rate=TELEPHONY_SAMPLE_RATE):
            if transport.interrupted() or transport.closed():
                break  # barge-in / hangup: stop talking immediately
            await transport.send_audio(chunk)

    async def run(self, transport):
        """Drive the whole conversation until the caller hangs up."""
        self.turns.append({"role": "rep", "text": self.opener})
        await self._speak(self.opener, transport)
        rep_turns = 1  # the opener counts
        while not transport.closed():
            pcm = await transport.collect_utterance()
            if pcm is None:
                break
            # STT (faster-whisper) and the brain (synchronous Anthropic HTTP) are
            # blocking — run them OFF the event loop so a concurrent call's media
            # keeps flowing and barge-in stays responsive instead of one call
            # freezing every other call sharing this worker.
            heard = await asyncio.to_thread(transcribe, pcm, TELEPHONY_SAMPLE_RATE)
            if not heard:
                continue
            self.turns.append({"role": "prospect", "text": heard})
            # At the cap, force a graceful close so the call can't loop forever.
            wrap = rep_turns >= MAX_REP_TURNS
            line = await asyncio.to_thread(next_line, self.turns, self.context, wrap)
            if not line:
                continue
            self.turns.append({"role": "rep", "text": line})
            rep_turns += 1
            await self._speak(line, transport)
            if wrap:
                break  # delivered the closing line — end the call gracefully
        return self.turns  # full transcript, for logging back to the CRM
