"""Call-language plumbing: normalize_lang coercion + CallAgent language behavior.
Stdlib-only (heavy STT/TTS deps stay lazy — nothing here loads a model)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stt import normalize_lang  # noqa: E402
from agent import CallAgent  # noqa: E402


class NormalizeLangTests(unittest.TestCase):
    def test_plain_codes_pass_through(self):
        self.assertEqual(normalize_lang("es"), "es")
        self.assertEqual(normalize_lang("ja"), "ja")

    def test_locales_and_case_are_coerced(self):
        self.assertEqual(normalize_lang("es-MX"), "es")
        self.assertEqual(normalize_lang("PT_br"), "pt")
        self.assertEqual(normalize_lang("  FR "), "fr")

    def test_garbage_falls_back_to_english(self):
        for bad in ("", "x", "esp", "e1", "<script>", None, 42, {"a": 1}):
            self.assertEqual(normalize_lang(bad), "en", bad)


class CallAgentLangTests(unittest.TestCase):
    def test_default_is_english_with_untouched_context(self):
        a = CallAgent(context="Deal brief.")
        self.assertEqual(a.lang, "en")
        self.assertEqual(a.context, "Deal brief.")

    def test_language_pins_stt_and_briefs_the_brain(self):
        a = CallAgent(context="Deal brief.", lang="es-MX")
        self.assertEqual(a.lang, "es")
        self.assertIn("Deal brief.", a.context)
        self.assertIn("'es'", a.context)  # the brain is told the call language

    def test_invalid_lang_degrades_to_english_quietly(self):
        a = CallAgent(context="Deal brief.", lang="not-a-lang!")
        self.assertEqual(a.lang, "en")
        self.assertEqual(a.context, "Deal brief.")  # no hint appended


if __name__ == "__main__":
    unittest.main()
