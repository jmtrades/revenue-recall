"""Unit tests for the streaming brain — sentence splitting + async streaming.

Run from services/call-gateway/:  python3 -m unittest discover -s tests -v
Stdlib only: the Anthropic client is faked, so no third-party deps are needed."""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import brain  # noqa: E402


class TestSplit(unittest.TestCase):
    def test_emits_only_complete_sentences_holds_partial(self):
        done, left = brain.split_complete_sentences("Hey there. How are")
        self.assertEqual(done, ["Hey there."])
        self.assertEqual(left, " How are")

    def test_terminator_at_very_end_is_held(self):
        # No trailing space yet — more might be coming (e.g. "3.14"), so hold it.
        done, left = brain.split_complete_sentences("Sounds good.")
        self.assertEqual(done, [])
        self.assertEqual(left, "Sounds good.")

    def test_multiple_sentences_and_punctuation(self):
        done, left = brain.split_complete_sentences("Sure! Right? Okay then ")
        self.assertEqual(done, ["Sure!", "Right?"])
        # Leftover may carry leading whitespace — always stripped before it's spoken.
        self.assertEqual(left.strip(), "Okay then")

    def test_empty(self):
        self.assertEqual(brain.split_complete_sentences(""), ([], ""))


# ── Fakes for the async Anthropic streaming client ──────────────────────────
class _FakeStream:
    def __init__(self, deltas):
        self._deltas = deltas

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        async def _gen():
            for d in self._deltas:
                yield d
        return _gen()


class _FakeMessages:
    def __init__(self, deltas):
        self._deltas = deltas

    def stream(self, **_kw):
        return _FakeStream(self._deltas)


class _FakeClient:
    def __init__(self, deltas):
        self.messages = _FakeMessages(deltas)


async def _collect(deltas):
    brain._get_async_client = lambda: _FakeClient(deltas)
    out = []
    async for s in brain.stream_lines([{"role": "prospect", "text": "hi"}]):
        out.append(s)
    return out


class TestStreamLines(unittest.TestCase):
    def test_sentences_emitted_across_chunk_boundaries(self):
        # Sentence boundaries fall mid-chunk — they must still be detected, and the
        # final partial flushed at stream end.
        out = asyncio.run(_collect(["Hey the", "re. How ", "are you?"]))
        self.assertEqual(out, ["Hey there.", "How are you?"])

    def test_single_unterminated_reply_is_flushed_at_end(self):
        out = asyncio.run(_collect(["No worries", " I'll send it"]))
        self.assertEqual(out, ["No worries I'll send it"])

    def test_empty_stream_yields_nothing(self):
        self.assertEqual(asyncio.run(_collect([])), [])


if __name__ == "__main__":
    unittest.main()
