"""Text front-end for natural TTS — the unglamorous thing that actually makes a
voice sound human on real sales content. Raw neural TTS mangles money, percents,
times, ordinals, phone numbers, acronyms, and emails; this expands them to how a
person would *say* them before synthesis.

Pure stdlib (`re`), fully testable without a model. Applied to every utterance.
"""
from __future__ import annotations

import re

_ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_SCALES = [(10 ** 12, "trillion"), (10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")]


def _under_1000(n: int) -> list[str]:
    words: list[str] = []
    if n >= 100:
        words += [_ONES[n // 100], "hundred"]
        n %= 100
    if n >= 20:
        words.append(_TENS[n // 10])
        if n % 10:
            words.append(_ONES[n % 10])
    elif n > 0:
        words.append(_ONES[n])
    return words


def int_to_words(n: int) -> str:
    if n == 0:
        return "zero"
    neg, n = n < 0, abs(n)
    parts: list[str] = []
    for value, name in _SCALES:
        if n >= value:
            parts += _under_1000(n // value) + [name]
            n %= value
    if n:
        parts += _under_1000(n)
    out = " ".join(parts)
    return f"negative {out}" if neg else out


def _decimal_to_words(s: str) -> str:
    whole, _, frac = s.partition(".")
    whole = whole.replace(",", "") or "0"
    out = int_to_words(int(whole))
    if frac:
        out += " point " + " ".join(_ONES[int(d)] for d in frac if d.isdigit())
    return out


_ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth",
        "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}


def ordinal_words(n: int) -> str:
    toks = int_to_words(n).split()
    last = toks[-1]
    if last in _ORD:
        toks[-1] = _ORD[last]
    elif last.endswith("y"):
        toks[-1] = last[:-1] + "ieth"
    else:
        toks[-1] = last + "th"
    return " ".join(toks)


def _money(m: str) -> str:
    s = m.replace(",", "")
    if "." in s:
        d, c = s.split(".", 1)
        c = (c + "00")[:2]
        dollars, cents = int(d or 0), int(c)
        out = f"{int_to_words(dollars)} dollar" + ("" if dollars == 1 else "s")
        if cents:
            out += f" and {int_to_words(cents)} cent" + ("" if cents == 1 else "s")
        return out
    n = int(s or 0)
    return f"{int_to_words(n)} dollar" + ("" if n == 1 else "s")


_SCALE_WORD = {"k": "thousand", "m": "million", "b": "billion", "bn": "billion",
               "thousand": "thousand", "million": "million", "billion": "billion", "trillion": "trillion"}


def _money_scale(m: "re.Match[str]") -> str:
    """'$4.2 million' → 'four point two million dollars'; '$3k' → 'three thousand dollars'."""
    return f"{_decimal_to_words(m.group(1))} {_SCALE_WORD[m.group(2).lower()]} dollars"


_ABBREV = {
    r"\bDr\.": "Doctor", r"\bMr\.": "Mister", r"\bMrs\.": "Missus", r"\bMs\.": "Miss",
    r"\bSt\.": "Street", r"\bAve\.": "Avenue", r"\bInc\.": "Incorporated", r"\bCorp\.": "Corporation",
    r"\bCo\.": "Company", r"\bLtd\.": "Limited", r"\bvs\.?\b": "versus", r"\be\.g\.": "for example",
    r"\bi\.e\.": "that is", r"\betc\.": "etcetera", r"\bapprox\.": "approximately", r"\bappt\b": "appointment",
}
# Acronyms worth spelling out letter-by-letter (avoid mangling normal words).
_SPELL = {"AI", "API", "CRM", "SaaS", "CEO", "CFO", "CTO", "COO", "VP", "ROI", "B2B", "B2C",
          "SMS", "FAQ", "URL", "SDR", "KPI", "USD", "ARR", "MRR", "LTV", "CAC", "NPS", "SLA",
          "RFP", "QBR", "MQL", "SQL", "ROAS", "CTA", "AE", "BDR", "ICP", "TAM"}


def _digits(s: str) -> str:
    return " ".join(_ONES[int(c)] for c in s if c.isdigit())


def _phone(m: "re.Match[str]") -> str:
    """Read a phone number as grouped spoken digits with comma pauses
    ('+1 (555) 123-4567' -> 'one, five five five, one two three, four five six seven')."""
    groups = [g for g in re.split(r"[\s().\-]+", m.group(0)) if g.strip(" +")]
    spoken = [_digits(g) for g in groups if any(c.isdigit() for c in g)]
    return ", ".join(p for p in spoken if p)


def _time_hm(m: "re.Match[str]") -> str:
    """'2:30pm' -> 'two thirty PM'; '2:00pm' -> 'two o'clock PM'."""
    hour = int_to_words(int(m.group(1)))
    minute = m.group(2)
    spoken_min = "o'clock" if minute == "00" else int_to_words(int(minute))
    return f"{hour} {spoken_min} {m.group(3).upper()}M"


def normalize(text: str) -> str:
    """Expand money/percent/time/ordinals/numbers/acronyms/emails to spoken form."""
    t = text
    # Emails & bare domains → "name at host dot com".
    t = re.sub(r"\b([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+)\b",
               lambda m: m.group(1).replace(".", " dot ") + " at " + m.group(2).replace(".", " dot "), t)
    t = re.sub(r"\b([A-Za-z0-9\-]+)\.(com|io|co|net|org|ai|app)\b",
               lambda m: f"{m.group(1)} dot {m.group(2)}", t)
    # Money with a scale word ("$4.2 million" → "four point two million dollars").
    t = re.sub(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million|thousand|bn|[kmb])\b",
               _money_scale, t, flags=re.I)
    # Money first (so "$10,000,000" stays an amount, never dialed digit-by-digit).
    t = re.sub(r"\$\s?(\d[\d,]*(?:\.\d+)?)", lambda m: _money(m.group(1)), t)
    # Percent.
    t = re.sub(r"(\d+(?:\.\d+)?)\s*%", lambda m: f"{_decimal_to_words(m.group(1))} percent", t)
    # Phone numbers (7+ digits with separators) → spoken digits, grouped by pauses.
    t = re.sub(r"\+?\d[\d\s().\-]{6,}\d", _phone, t)
    # Times: 2:30pm / 2pm.
    t = re.sub(r"\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?", _time_hm, t, flags=re.I)
    t = re.sub(r"\b(\d{1,2})\s*([ap])\.?m\.?",
               lambda m: f"{int_to_words(int(m.group(1)))} {m.group(2).upper()}M", t, flags=re.I)
    # Fiscal quarters: Q3 → "Q three".
    t = re.sub(r"\bQ([1-4])\b", lambda m: f"Q {int_to_words(int(m.group(1)))}", t)
    # Ordinals: 1st, 22nd…
    t = re.sub(r"\b(\d+)(?:st|nd|rd|th)\b", lambda m: ordinal_words(int(m.group(1))), t)
    # Plain numbers (with commas / decimals).
    t = re.sub(r"\b\d[\d,]*(?:\.\d+)?\b", lambda m: _decimal_to_words(m.group(0)), t)
    # Abbreviations.
    for pat, rep in _ABBREV.items():
        t = re.sub(pat, rep, t)
    # Symbols.
    t = t.replace("&", " and ").replace("%", " percent ").replace("#", " number ").replace("@", " at ")
    # Acronyms → spaced letters.
    t = re.sub(r"\b([A-Za-z0-9]{2,5})\b", lambda m: " ".join(m.group(1)) if m.group(1) in _SPELL else m.group(1), t)
    # Tidy whitespace.
    return re.sub(r"\s{2,}", " ", t).strip()


_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")


def split_sentences(text: str, max_len: int = 240) -> list[str]:
    """Split into sentence-ish chunks so the engine can stream the first one
    immediately (low first-audio latency). Over-long sentences split on commas."""
    out: list[str] = []
    for s in _SENT.split(text.strip()):
        s = s.strip()
        if not s:
            continue
        if len(s) <= max_len:
            out.append(s)
            continue
        buf = ""
        for piece in s.split(", "):
            if buf and len(buf) + len(piece) + 2 > max_len:
                out.append(buf.strip(", ").strip())
                buf = ""
            buf += piece + ", "
        if buf.strip(", ").strip():
            out.append(buf.strip(", ").strip())
    return out or ([text.strip()] if text.strip() else [])
