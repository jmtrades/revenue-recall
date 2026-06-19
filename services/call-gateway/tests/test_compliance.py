"""Tests for in-call opt-out detection (stdlib only)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from compliance import is_opt_out  # noqa: E402


class TestIsOptOut(unittest.TestCase):
    def test_clear_opt_outs_are_detected(self):
        for phrase in [
            "stop",
            "Stop.",
            "please stop",
            "stop calling me",
            "do not call me again",
            "don't call me",
            "take me off your list",
            "remove me from your list",
            "remove my number",
            "lose my number",
            "leave me alone",
            "unsubscribe",
            "opt me out",
            "quit calling this number",
            "no more calls",
        ]:
            self.assertTrue(is_opt_out(phrase), f"should be opt-out: {phrase!r}")

    def test_non_opt_outs_are_not_flagged(self):
        # Soft declines / ordinary conversation must NOT be treated as a hard
        # opt-out — the brain handles those as objections.
        for phrase in [
            "",
            "not interested right now",
            "I'm a bit busy",
            "can you stop by the office later",
            "don't stop, this is interesting",
            "call me tomorrow",
            "sounds good",
            "what's the price",
        ]:
            self.assertFalse(is_opt_out(phrase), f"should NOT be opt-out: {phrase!r}")


if __name__ == "__main__":
    unittest.main()
