"""The live-call agent: listen → think → speak, with barge-in. Pure orchestration
over the STT / brain / TTS seams and a media transport — fully in-house."""
import asyncio

from brain import stream_lines
from stt import transcribe
from tts import synthesize
from config import TELEPHONY_SAMPLE_RATE, CALL_AI_DISCLOSURE

DEFAULT_OPENER = "Hey, it's me — caught you at an okay time?"

# Hard ceiling on rep turns. The brain already wraps a repeated objection on its
# own; this is the backstop so a live call can NEVER loop indefinitely — at the
# cap we force one graceful closing line and hang up.
MAX_REP_TURNS = 12
# Spoken if the model returns nothing exactly when we hit the cap, so the close
# (and hang-up) still happens instead of the loop continuing.
WRAP_FALLBACK = "I'll let you go for now — I'll send a quick note and try you another time. Take care."


class CallAgent:
    def __init__(self, context: str = "", voice_id=None, opener: str = DEFAULT_OPENER, voicemail=None, disclosure: str = CALL_AI_DISCLOSURE):
        self.turns = []
        self.context = context
        self.voice_id = voice_id
        self.opener = opener
        # Prepared voicemail to leave if the line goes to a machine (see leave_voicemail).
        self.voicemail = voicemail
        # Spoken first on a live answer — the required AI/bot disclosure. "" disables.
        self.disclosure = (disclosure or "").strip()

    async def _speak(self, text: str, transport):
        async for chunk in synthesize(text, voice_id=self.voice_id, sample_rate=TELEPHONY_SAMPLE_RATE):
            if transport.interrupted() or transport.closed():
                break  # barge-in / hangup: stop talking immediately
            await transport.send_audio(chunk)

    async def _speak_stream(self, sentences, transport) -> str:
        """Speak the reply as it streams in — synthesize and send each sentence the
        moment the brain finishes it, so the prospect hears the first words almost
        immediately instead of after the whole reply is generated (far less dead
        air). Honors barge-in/hangup between sentences AND mid-sentence. Returns the
        text actually spoken, for the transcript."""
        spoken = []
        async for sentence in sentences:
            if transport.interrupted() or transport.closed():
                break
            await self._speak(sentence, transport)
            spoken.append(sentence)
        return " ".join(spoken).strip()

    async def leave_voicemail(self, transport) -> bool:
        """Speak the prepared voicemail, then let the call end. Invoked by the
        telephony layer's answering-machine detection (Twilio `machine_detection`
        / FreeSWITCH AMD) when the line goes to voicemail — wire that signal to
        call this instead of run(). No-op (returns False) if none was prepared."""
        if not self.voicemail:
            return False
        self.turns.append({"role": "rep", "text": self.voicemail})
        await self._speak(self.voicemail, transport)
        return True

    async def run(self, transport):
        """Drive the whole conversation until the caller hangs up."""
        # Required AI disclosure first, before any pitch — then the opener.
        if self.disclosure:
            self.turns.append({"role": "rep", "text": self.disclosure})
            await self._speak(self.disclosure, transport)
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
            # Stream the reply straight into TTS so we start speaking on the first
            # sentence (the brain runs natively async, off the blocking path).
            line = await self._speak_stream(stream_lines(self.turns, self.context, wrap), transport)
            if not line:
                # Below the cap, just keep listening. AT the cap we must still close —
                # otherwise an empty model line would skip the break and the safety
                # cap becomes bypassable (the call runs until the caller hangs up).
                if not wrap:
                    continue
                line = WRAP_FALLBACK
                await self._speak(line, transport)
            self.turns.append({"role": "rep", "text": line})
            rep_turns += 1
            if wrap:
                break  # delivered the closing line — end the call gracefully
        return self.turns  # full transcript, for logging back to the CRM
