"""Unit tests for the gateway's TTS pure logic (no network, no third-party deps).

Run: python3 -m unittest discover -s tests

Covers the parts most prone to a silent error — the house-voice → ElevenLabs id
mapping (a wrong id = the call speaks in the wrong voice) and the per-emotion
voice settings. The network paths (_neural_synthesize / _elevenlabs_synthesize)
need a live service and are validated against the deployed gateway.
"""
import unittest

import tts


class ElevenVoiceMapping(unittest.TestCase):
    def test_known_house_voice_maps_to_its_elevenlabs_id(self):
        self.assertEqual(tts._eleven_voice("af_heart"), "21m00Tcm4TlvDq8ikWAM")  # Rachel
        self.assertEqual(tts._eleven_voice("bm_george"), "JBFqnCBsd6RMkjVDRZzb")  # George

    def test_clone_voice_uses_the_default(self):
        self.assertEqual(tts._eleven_voice("clone:rep_42"), tts._DEFAULT_ELEVEN_VOICE)

    def test_unknown_or_empty_voice_uses_the_default(self):
        self.assertEqual(tts._eleven_voice("not_a_voice"), tts._DEFAULT_ELEVEN_VOICE)
        self.assertEqual(tts._eleven_voice(None), tts._DEFAULT_ELEVEN_VOICE)

    def test_configured_override_wins_for_clone_and_unknown(self):
        original = tts.CALL_ELEVENLABS_VOICE_ID
        try:
            tts.CALL_ELEVENLABS_VOICE_ID = "operator_choice"
            self.assertEqual(tts._eleven_voice("clone:rep_42"), "operator_choice")
            self.assertEqual(tts._eleven_voice("not_a_voice"), "operator_choice")
            # A known house voice still maps to its own id, not the override.
            self.assertEqual(tts._eleven_voice("am_adam"), "pNInz6obpgDQGcFmaJgB")
        finally:
            tts.CALL_ELEVENLABS_VOICE_ID = original


class ElevenSettings(unittest.TestCase):
    def test_known_emotion_shapes_delivery(self):
        energetic = tts._eleven_settings("energetic")
        calm = tts._eleven_settings("calm")
        self.assertLess(energetic["stability"], calm["stability"])

    def test_unknown_emotion_falls_back_to_neutral(self):
        self.assertEqual(tts._eleven_settings("nonexistent"), tts._eleven_settings(None))

    def test_speaker_boost_always_on(self):
        for e in ("energetic", "warm", "empathetic", "calm", "confident", None):
            self.assertTrue(tts._eleven_settings(e)["use_speaker_boost"])


if __name__ == "__main__":
    unittest.main()
