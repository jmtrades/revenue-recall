"""Unit tests for the TTS text front-end — pure stdlib, no model/deps.

Run from services/neural-voice/:  python3 -m unittest discover -s tests -v
This is what makes the AI voice say money/percent/time/phone numbers like a
human on real sales calls, so its behavior is worth pinning down."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from text_norm import int_to_words, ordinal_words, normalize, split_sentences  # noqa: E402


class TestIntToWords(unittest.TestCase):
    def test_basics_and_scales(self):
        self.assertEqual(int_to_words(0), "zero")
        self.assertEqual(int_to_words(7), "seven")
        self.assertEqual(int_to_words(21), "twenty one")
        self.assertEqual(int_to_words(100), "one hundred")
        self.assertEqual(int_to_words(1000), "one thousand")
        self.assertEqual(int_to_words(1234), "one thousand two hundred thirty four")
        self.assertEqual(int_to_words(-5), "negative five")


class TestOrdinals(unittest.TestCase):
    def test_special_and_regular(self):
        self.assertEqual(ordinal_words(1), "first")
        self.assertEqual(ordinal_words(2), "second")
        self.assertEqual(ordinal_words(3), "third")
        self.assertEqual(ordinal_words(5), "fifth")
        self.assertEqual(ordinal_words(12), "twelfth")
        self.assertEqual(ordinal_words(20), "twentieth")
        self.assertEqual(ordinal_words(21), "twenty first")
        self.assertEqual(ordinal_words(4), "fourth")


class TestNormalizeMoney(unittest.TestCase):
    def test_plain_money_singular_plural_and_cents(self):
        self.assertEqual(normalize("$1"), "one dollar")
        self.assertEqual(normalize("$5"), "five dollars")
        self.assertEqual(normalize("$4.50"), "four dollars and fifty cents")

    def test_scaled_money(self):
        self.assertEqual(normalize("$4.2 million"), "four point two million dollars")
        self.assertEqual(normalize("$3k"), "three thousand dollars")

    def test_big_amount_is_never_dialed_as_a_phone(self):
        out = normalize("$10,000,000")
        self.assertIn("ten million dollars", out)
        self.assertNotIn(",", out.replace(" ", ""))  # not read digit-by-digit


class TestNormalizeMisc(unittest.TestCase):
    def test_percent(self):
        self.assertEqual(normalize("20%"), "twenty percent")
        self.assertEqual(normalize("2.5%"), "two point five percent")

    def test_time(self):
        self.assertEqual(normalize("2:30pm"), "two thirty PM")
        self.assertEqual(normalize("2:00pm"), "two o'clock PM")
        self.assertEqual(normalize("2pm"), "two PM")

    def test_email_and_domain(self):
        self.assertEqual(normalize("joe@acme.com"), "joe at acme dot com")
        self.assertIn("acme dot io", normalize("see acme.io"))

    def test_phone_is_spoken_in_grouped_digits(self):
        out = normalize("call +1 (555) 123-4567")
        self.assertIn("five five five", out)
        self.assertIn(",", out)  # grouped with comma pauses

    def test_quarter_and_ordinal(self):
        self.assertEqual(normalize("Q3"), "Q three")
        self.assertEqual(normalize("the 22nd"), "the twenty second")

    def test_acronyms_spelled_out_but_words_left_alone(self):
        self.assertEqual(normalize("CRM"), "C R M")
        self.assertEqual(normalize("hello there"), "hello there")  # ordinary words untouched


class TestSplitSentences(unittest.TestCase):
    def test_splits_on_sentence_boundaries(self):
        self.assertEqual(split_sentences("Hi there. How are you? Great!"), ["Hi there.", "How are you?", "Great!"])

    def test_empty_input_returns_empty(self):
        self.assertEqual(split_sentences("   "), [])

    def test_overlong_sentence_splits_on_commas(self):
        long = "one two three, " * 30  # ~450 chars, no sentence end
        chunks = split_sentences(long.strip(), max_len=240)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c) <= 240 for c in chunks))


if __name__ == "__main__":
    unittest.main()
