"""Media-WebSocket authorization (stdlib only — no numpy/fastapi import).

The gateway's /media and /twilio/media sockets run a full paid live agent (Whisper
STT → Opus brain → ElevenLabs TTS). Authorization is "the call_id is one we just
originated" — present in the in-flight `_pending` map. These tests pin that an
unknown/empty id is rejected (closing the unauthenticated cost-burn vector) and a
known one is allowed.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gateway_auth import media_authorized  # noqa: E402


class TestMediaAuthorized(unittest.TestCase):
    def setUp(self):
        # A clean slate — no stray bypass leaking in from the environment.
        self._saved = os.environ.pop("GATEWAY_ALLOW_INSECURE", None)

    def tearDown(self):
        if self._saved is None:
            os.environ.pop("GATEWAY_ALLOW_INSECURE", None)
        else:
            os.environ["GATEWAY_ALLOW_INSECURE"] = self._saved

    def test_known_in_flight_id_is_authorized(self):
        pending = {"abc123": {"to": "+15551234567"}}
        self.assertTrue(media_authorized("abc123", pending))

    def test_unknown_id_is_rejected(self):
        self.assertFalse(media_authorized("not-a-real-call", {"abc123": {}}))

    def test_empty_or_none_id_is_rejected(self):
        self.assertFalse(media_authorized("", {"abc123": {}}))
        self.assertFalse(media_authorized(None, {"abc123": {}}))

    def test_reject_against_empty_pending(self):
        # No calls in flight → nothing is authorized.
        self.assertFalse(media_authorized("anything", {}))

    def test_insecure_env_bypasses_for_local_dev(self):
        for val in ("1", "true", "TRUE", "yes"):
            os.environ["GATEWAY_ALLOW_INSECURE"] = val
            self.assertTrue(media_authorized("unknown", {}), val)

    def test_insecure_env_off_does_not_bypass(self):
        os.environ["GATEWAY_ALLOW_INSECURE"] = "false"
        self.assertFalse(media_authorized("unknown", {}))


if __name__ == "__main__":
    unittest.main()
