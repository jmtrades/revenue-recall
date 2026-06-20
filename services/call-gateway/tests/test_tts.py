"""Tests for ElevenLabs voice resolution + telephony downsampling (stdlib only)."""
import array
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from voices import eleven_voice, HOUSE_TO_ELEVEN  # noqa: E402
from tts import downsample_16k_to_8k  # noqa: E402


class TestElevenVoice(unittest.TestCase):
    def test_house_id_maps_to_its_elevenlabs_voice(self):
        self.assertEqual(eleven_voice("am_adam"), HOUSE_TO_ELEVEN["am_adam"])
        self.assertEqual(eleven_voice("bm_george"), HOUSE_TO_ELEVEN["bm_george"])

    def test_clone_prefix_passes_the_raw_elevenlabs_id_through(self):
        self.assertEqual(eleven_voice("eleven:abc123XYZ"), "abc123XYZ")

    def test_none_uses_the_configured_fallback_then_the_default(self):
        self.assertEqual(eleven_voice(None, "FALLBACK_ID"), "FALLBACK_ID")
        self.assertEqual(eleven_voice(None), HOUSE_TO_ELEVEN["af_heart"])

    def test_unmapped_house_id_resolves_to_the_same_group(self):
        # An unknown male-UK id → the male-UK default (George), never a mismatch.
        self.assertEqual(eleven_voice("bm_unknown"), HOUSE_TO_ELEVEN["bm_george"])
        self.assertEqual(eleven_voice("am_unknown"), HOUSE_TO_ELEVEN["am_adam"])
        # Unknown group → the overall default.
        self.assertEqual(eleven_voice("zz_unknown"), HOUSE_TO_ELEVEN["af_heart"])


class TestDownsample(unittest.TestCase):
    def _pcm(self, samples):
        a = array.array("h", samples)
        if sys.byteorder == "big":
            a.byteswap()  # emit little-endian
        return a.tobytes()

    def _samples(self, pcm):
        a = array.array("h")
        a.frombytes(pcm)
        if sys.byteorder == "big":
            a.byteswap()
        return list(a)

    def test_averages_consecutive_pairs_to_halve_the_rate(self):
        out = downsample_16k_to_8k(self._pcm([100, 200, 300, 400]))
        self.assertEqual(self._samples(out), [150, 350])  # (100+200)//2, (300+400)//2

    def test_drops_a_trailing_partial_pair(self):
        # 3 samples = 1.5 pairs → only the first whole pair survives.
        out = downsample_16k_to_8k(self._pcm([10, 20, 30]))
        self.assertEqual(self._samples(out), [15])

    def test_empty_and_sub_sample_input(self):
        self.assertEqual(downsample_16k_to_8k(b""), b"")
        self.assertEqual(downsample_16k_to_8k(b"\x01"), b"")  # < one sample


if __name__ == "__main__":
    unittest.main()
