"""Unit tests for answering-machine detection — pure logic, stdlib only.

Run from services/call-gateway/:  python3 -m unittest discover -s tests -v
No third-party deps (the gateway's runtime deps aren't needed for these)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import amd  # noqa: E402
import config  # noqa: E402
import twilio_out  # noqa: E402


class TestClassify(unittest.TestCase):
    def test_machine_variants_all_classify_as_machine(self):
        for v in ("machine_start", "machine_end_beep", "machine_end_silence", "machine_end_other", "MACHINE_END_BEEP"):
            self.assertEqual(amd.classify(v), "machine", v)
            self.assertTrue(amd.is_machine(v), v)

    def test_human_fax_unknown(self):
        self.assertEqual(amd.classify("human"), "human")
        self.assertEqual(amd.classify("fax"), "fax")
        self.assertEqual(amd.classify("unknown"), "unknown")
        self.assertEqual(amd.classify(""), "unknown")
        self.assertEqual(amd.classify(None), "unknown")
        self.assertFalse(amd.is_machine("human"))

    def test_ready_for_voicemail_only_after_greeting_ends(self):
        # machine_start = greeting still playing → too early to leave a message.
        self.assertFalse(amd.ready_for_voicemail("machine_start"))
        for v in ("machine_end_beep", "machine_end_silence", "machine_end_other"):
            self.assertTrue(amd.ready_for_voicemail(v), v)
        self.assertFalse(amd.ready_for_voicemail("human"))


class TestCallOutcome(unittest.TestCase):
    def test_amd_is_authoritative_over_heard_heuristic(self):
        # A machine that we 'heard' (its greeting) is still a voicemail, not completed.
        self.assertEqual(amd.call_outcome("machine_end_beep", heard_prospect=True), "voicemail")
        self.assertEqual(amd.call_outcome("human", heard_prospect=False), "completed")
        self.assertEqual(amd.call_outcome("fax", heard_prospect=True), "fax")

    def test_falls_back_to_heuristic_without_a_verdict(self):
        self.assertEqual(amd.call_outcome(None, heard_prospect=True), "completed")
        self.assertEqual(amd.call_outcome("", heard_prospect=False), "no-answer")
        self.assertEqual(amd.call_outcome("unknown", heard_prospect=False), "no-answer")

    def test_voicemail_outcome_matches_app_retry_regex(self):
        # Mirror src/lib/calls/retry.ts isVoicemailOutcome — the value MUST trip it
        # so the app schedules its voicemail follow-up.
        import re
        rx = re.compile(r"(voicemail|\bvm\b|machine|left a message)", re.I)
        self.assertTrue(rx.search(amd.call_outcome("machine_end_beep", False)))


class TestAmdToken(unittest.TestCase):
    def test_stable_and_keyed(self):
        a = amd.amd_token("call123", "secret")
        self.assertEqual(a, amd.amd_token("call123", "secret"))      # stable
        self.assertNotEqual(a, amd.amd_token("call999", "secret"))   # per-call
        self.assertNotEqual(a, amd.amd_token("call123", "other"))    # per-secret
        self.assertEqual(len(a), 32)

    def test_empty_without_secret(self):
        self.assertEqual(amd.amd_token("call123", ""), "")


class TestCallParamsGating(unittest.TestCase):
    """call_params() must add AMD params only when enabled — so existing calls
    are byte-for-byte unchanged until an operator opts in."""

    def setUp(self):
        self._saved = (config.AMD_ENABLED, config.PUBLIC_HTTPS_BASE, config.COMMS_WEBHOOK_TOKEN, config.AMD_TIMEOUT_SEC, config.PUBLIC_WSS_BASE)
        # twilio_ready() guarantees this is set before originate()/call_params run.
        config.PUBLIC_WSS_BASE = "wss://calls.example.com"

    def tearDown(self):
        config.AMD_ENABLED, config.PUBLIC_HTTPS_BASE, config.COMMS_WEBHOOK_TOKEN, config.AMD_TIMEOUT_SEC, config.PUBLIC_WSS_BASE = self._saved

    def test_disabled_by_default_no_amd_params(self):
        config.AMD_ENABLED = False
        p = twilio_out.call_params("+15551230000", "cid", "+15550000000")
        self.assertEqual(set(p), {"To", "From", "Twiml"})
        self.assertNotIn("MachineDetection", p)

    def test_enabled_adds_async_amd_with_signed_callback(self):
        config.AMD_ENABLED = True
        config.PUBLIC_HTTPS_BASE = "https://calls.example.com"
        config.COMMS_WEBHOOK_TOKEN = "shh"
        config.AMD_TIMEOUT_SEC = 25
        p = twilio_out.call_params("+15551230000", "cid", "+15550000000")
        self.assertEqual(p["MachineDetection"], "DetectMessageEnd")
        self.assertEqual(p["AsyncAmd"], "true")
        self.assertEqual(p["MachineDetectionTimeout"], "25")
        cb = p["AsyncAmdStatusCallback"]
        self.assertTrue(cb.startswith("https://calls.example.com/twilio/amd?"))
        self.assertIn("callId=cid", cb)
        self.assertIn("t=" + amd.amd_token("cid", "shh"), cb)  # signed, verifiable

    def test_enabled_but_no_public_base_stays_safe(self):
        config.AMD_ENABLED = True
        config.PUBLIC_HTTPS_BASE = None
        p = twilio_out.call_params("+15551230000", "cid", "+15550000000")
        self.assertNotIn("MachineDetection", p)  # can't get the callback → don't enable


if __name__ == "__main__":
    unittest.main()
