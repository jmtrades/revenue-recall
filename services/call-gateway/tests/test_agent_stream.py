"""Unit tests for the live-call agent orchestration (streamed reply → TTS).

Run from services/call-gateway/:  python3 -m unittest discover -s tests -v
Stdlib only: STT / TTS / brain are faked, so no third-party deps are needed
(tts/stt import their heavy deps lazily, so importing the agent is dep-free)."""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import agent  # noqa: E402


class FakeTransport:
    """Scripted call media: hands the agent each queued utterance, records what the
    agent sends back, and can simulate barge-in."""

    def __init__(self, utterances, interrupt=False):
        self._utts = list(utterances)
        self.sent = []
        self._closed = False
        self._interrupt = interrupt

    async def send_audio(self, pcm):
        self.sent.append(pcm)

    async def collect_utterance(self):
        if not self._utts:
            self._closed = True
            return None
        u = self._utts.pop(0)
        if u is None:
            self._closed = True
        return u

    def interrupted(self):
        return self._interrupt

    def closed(self):
        return self._closed

    def spoken_text(self):
        return b" ".join(self.sent).decode()


def _install_fakes(sentences, heard="hello"):
    """Point the agent at fake STT/TTS/brain. Returns nothing; mutates module globals."""
    async def fake_synth(text, voice_id=None, sample_rate=8000):
        yield b"<" + text.encode() + b">"

    def fake_stream(scripted):
        async def _s(turns, context="", wrap=False):
            for x in scripted:
                yield x
        return _s

    agent.transcribe = lambda pcm, sr: heard
    agent.synthesize = fake_synth
    agent.stream_lines = fake_stream(sentences)


class TestAgentRun(unittest.TestCase):
    def test_disclosure_opener_then_streamed_reply_spoken_and_logged(self):
        _install_fakes(["Sure thing.", "Talk soon."])
        a = agent.CallAgent(opener="Opener line.", disclosure="Disclosure.")
        transport = FakeTransport([b"utterance", None])
        turns = asyncio.run(a.run(transport))

        spoken = transport.spoken_text()
        for expect in ("Disclosure.", "Opener line.", "Sure thing.", "Talk soon."):
            self.assertIn(expect, spoken)
        # Disclosure first, opener second; prospect utterance transcribed; reply joined.
        self.assertEqual(turns[0], {"role": "rep", "text": "Disclosure."})
        self.assertEqual(turns[1], {"role": "rep", "text": "Opener line."})
        self.assertIn({"role": "prospect", "text": "hello"}, turns)
        self.assertIn({"role": "rep", "text": "Sure thing. Talk soon."}, turns)

    def test_barge_in_stops_the_reply_before_speaking(self):
        _install_fakes(["This should not be heard."])
        a = agent.CallAgent(opener="Hi.", disclosure="")
        transport = FakeTransport([b"x", None], interrupt=True)
        asyncio.run(a.run(transport))
        # Opener spoke before the interrupt flag matters for the reply; the streamed
        # reply must be suppressed once interrupted.
        self.assertNotIn("This should not be heard.", transport.spoken_text())

    def test_turn_cap_forces_close_with_fallback_when_model_silent(self):
        _install_fakes([])  # model returns nothing
        agent.MAX_REP_TURNS = 1  # opener already counts as turn 1 → next turn wraps
        try:
            a = agent.CallAgent(opener="Hi.", disclosure="")
            transport = FakeTransport([b"a", b"b", b"c"])
            asyncio.run(a.run(transport))
            # Wrap fallback spoken, and the call closed before draining every utterance.
            self.assertIn(agent.WRAP_FALLBACK, transport.spoken_text())
            self.assertGreater(len(transport._utts), 0)
        finally:
            agent.MAX_REP_TURNS = 12  # restore for other tests


class TestAgentResilience(unittest.TestCase):
    def test_stt_error_skips_the_turn_without_crashing_the_call(self):
        _install_fakes(["unused"])

        def boom(pcm, sr):
            raise RuntimeError("stt down")

        agent.transcribe = boom
        a = agent.CallAgent(opener="Opener.", disclosure="")
        transport = FakeTransport([b"x", None])
        turns = asyncio.run(a.run(transport))  # must not raise
        # Opener still delivered; the failed utterance produced no prospect/reply turn.
        self.assertIn("Opener.", transport.spoken_text())
        self.assertEqual([t for t in turns if t["role"] == "prospect"], [])

    def test_brain_error_recovers_in_call_instead_of_dropping(self):
        _install_fakes([])

        def raising_stream(turns, context="", wrap=False):
            async def _gen():
                raise RuntimeError("brain down")
                yield ""  # pragma: no cover — makes this an async generator
            return _gen()

        agent.transcribe = lambda pcm, sr: "hello"
        agent.stream_lines = raising_stream
        a = agent.CallAgent(opener="Opener.", disclosure="")
        transport = FakeTransport([b"x", None])
        turns = asyncio.run(a.run(transport))  # must not raise

        self.assertIn(agent.BRAIN_RETRY_LINE, transport.spoken_text())  # recovery nudge spoken
        self.assertIn({"role": "prospect", "text": "hello"}, turns)  # transcript preserved
        self.assertIn({"role": "rep", "text": agent.BRAIN_RETRY_LINE}, turns)


if __name__ == "__main__":
    unittest.main()
