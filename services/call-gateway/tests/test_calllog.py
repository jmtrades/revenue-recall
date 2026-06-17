"""Unit tests for the loop-closing call-status post-back — stdlib only, no deps.

Run from services/call-gateway/:  python3 -m unittest discover -s tests -v
This is the ONLY path a finished call's transcript reaches the CRM, so its
retry/backoff and misconfig behavior are worth pinning down."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calllog  # noqa: E402


class _FakeResp:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b"{}"


class TestTranscriptText(unittest.TestCase):
    def test_renders_rep_and_prospect_turns(self):
        out = calllog.transcript_text([{"role": "rep", "text": "Hi"}, {"role": "prospect", "text": "Hello"}])
        self.assertEqual(out, "Rep: Hi\nProspect: Hello")

    def test_unknown_role_falls_back_to_its_label(self):
        self.assertEqual(calllog.transcript_text([{"role": "system", "text": "x"}]), "system: x")

    def test_empty_turns(self):
        self.assertEqual(calllog.transcript_text([]), "")


class TestPostCallStatus(unittest.TestCase):
    def test_no_url_returns_false_without_attempting_a_request(self):
        calls = []
        ok = calllog.post_call_status("", "tok", {"to": "+1"}, urlopen=lambda *a, **k: calls.append(1) or _FakeResp())
        self.assertFalse(ok)  # the silent-failure misconfig is now reported as a hard False
        self.assertEqual(calls, [])

    def test_success_first_try_sends_post_with_bearer_auth(self):
        seen = {}

        def fake_urlopen(req, timeout=0):
            seen["auth"] = req.get_header("Authorization")
            seen["method"] = req.get_method()
            return _FakeResp()

        ok = calllog.post_call_status("https://app/api/calls/log", "secret", {"to": "+1"}, urlopen=fake_urlopen, sleep=lambda s: None)
        self.assertTrue(ok)
        self.assertEqual(seen["auth"], "Bearer secret")
        self.assertEqual(seen["method"], "POST")

    def test_retries_with_backoff_then_succeeds(self):
        attempts = {"n": 0}
        slept = []

        def flaky(req, timeout=0):
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise OSError("transient blip")
            return _FakeResp()

        ok = calllog.post_call_status("https://app", None, {"to": "+1"}, urlopen=flaky, sleep=slept.append)
        self.assertTrue(ok)
        self.assertEqual(attempts["n"], 3)
        self.assertEqual(slept, [1, 2])  # backoff 2**0, 2**1

    def test_permanent_failure_returns_false_after_all_attempts(self):
        attempts = {"n": 0}

        def always_fail(req, timeout=0):
            attempts["n"] += 1
            raise OSError("gateway down")

        ok = calllog.post_call_status("https://app", None, {"to": "+1"}, urlopen=always_fail, sleep=lambda s: None)
        self.assertFalse(ok)
        self.assertEqual(attempts["n"], 3)

    def test_no_token_omits_auth_header(self):
        seen = {}

        def fake(req, timeout=0):
            seen["auth"] = req.get_header("Authorization")
            return _FakeResp()

        calllog.post_call_status("https://app", None, {"to": "+1"}, urlopen=fake, sleep=lambda s: None)
        self.assertIsNone(seen["auth"])


if __name__ == "__main__":
    unittest.main()
