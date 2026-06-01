"""The live-call agent: listen → think → speak, with barge-in. Pure orchestration
over the STT / brain / TTS seams and a media transport — fully in-house."""
from brain import next_line
from stt import transcribe
from tts import synthesize
from config import TELEPHONY_SAMPLE_RATE

DEFAULT_OPENER = "Hey, it's me — caught you at an okay time?"


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
        while not transport.closed():
            pcm = await transport.collect_utterance()
            if pcm is None:
                break
            heard = transcribe(pcm, TELEPHONY_SAMPLE_RATE)
            if not heard:
                continue
            self.turns.append({"role": "prospect", "text": heard})
            line = next_line(self.turns, self.context)
            if not line:
                continue
            self.turns.append({"role": "rep", "text": line})
            await self._speak(line, transport)
        return self.turns  # full transcript, for logging back to the CRM
