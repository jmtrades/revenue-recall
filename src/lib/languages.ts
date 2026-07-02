/**
 * Outreach languages. Revenue Recall sells into every industry — and every
 * market. A workspace picks the language it sells in; the AI then writes email,
 * SMS, and call scripts in that language, and the voice synth speaks with a
 * matching locale. Pure and client-safe (used by the picker UI and tests).
 */

export interface Language {
  /** ISO 639-1 code, the value we store. */
  code: string;
  /** English label for menus. */
  label: string;
  /** Endonym — the language's own name, shown alongside. */
  native: string;
  /** BCP-47 locale used to pick a TTS voice. */
  locale: string;
  /**
   * True when the live-call voice model (ElevenLabs Turbo v2.5) speaks this
   * language, so autonomous phone calls work in it. Languages without the flag
   * still get full AI email/SMS outreach and read-aloud — just not live calls.
   */
  voiceCall?: boolean;
}

export const LANGUAGES: Language[] = [
  // ── Full support: AI email/SMS + live voice calls ─────────────────────────
  { code: "en", label: "English", native: "English", locale: "en-US", voiceCall: true },
  { code: "ar", label: "Arabic", native: "العربية", locale: "ar-SA", voiceCall: true },
  { code: "bg", label: "Bulgarian", native: "Български", locale: "bg-BG", voiceCall: true },
  { code: "zh", label: "Chinese", native: "中文", locale: "zh-CN", voiceCall: true },
  { code: "hr", label: "Croatian", native: "Hrvatski", locale: "hr-HR", voiceCall: true },
  { code: "cs", label: "Czech", native: "Čeština", locale: "cs-CZ", voiceCall: true },
  { code: "da", label: "Danish", native: "Dansk", locale: "da-DK", voiceCall: true },
  { code: "nl", label: "Dutch", native: "Nederlands", locale: "nl-NL", voiceCall: true },
  { code: "tl", label: "Filipino", native: "Filipino", locale: "fil-PH", voiceCall: true },
  { code: "fi", label: "Finnish", native: "Suomi", locale: "fi-FI", voiceCall: true },
  { code: "fr", label: "French", native: "Français", locale: "fr-FR", voiceCall: true },
  { code: "de", label: "German", native: "Deutsch", locale: "de-DE", voiceCall: true },
  { code: "el", label: "Greek", native: "Ελληνικά", locale: "el-GR", voiceCall: true },
  { code: "hi", label: "Hindi", native: "हिन्दी", locale: "hi-IN", voiceCall: true },
  { code: "hu", label: "Hungarian", native: "Magyar", locale: "hu-HU", voiceCall: true },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", locale: "id-ID", voiceCall: true },
  { code: "it", label: "Italian", native: "Italiano", locale: "it-IT", voiceCall: true },
  { code: "ja", label: "Japanese", native: "日本語", locale: "ja-JP", voiceCall: true },
  { code: "ko", label: "Korean", native: "한국어", locale: "ko-KR", voiceCall: true },
  { code: "ms", label: "Malay", native: "Bahasa Melayu", locale: "ms-MY", voiceCall: true },
  { code: "no", label: "Norwegian", native: "Norsk", locale: "no-NO", voiceCall: true },
  { code: "pl", label: "Polish", native: "Polski", locale: "pl-PL", voiceCall: true },
  { code: "pt", label: "Portuguese", native: "Português", locale: "pt-BR", voiceCall: true },
  { code: "ro", label: "Romanian", native: "Română", locale: "ro-RO", voiceCall: true },
  { code: "ru", label: "Russian", native: "Русский", locale: "ru-RU", voiceCall: true },
  { code: "sk", label: "Slovak", native: "Slovenčina", locale: "sk-SK", voiceCall: true },
  { code: "es", label: "Spanish", native: "Español", locale: "es-ES", voiceCall: true },
  { code: "sv", label: "Swedish", native: "Svenska", locale: "sv-SE", voiceCall: true },
  { code: "ta", label: "Tamil", native: "தமிழ்", locale: "ta-IN", voiceCall: true },
  { code: "tr", label: "Turkish", native: "Türkçe", locale: "tr-TR", voiceCall: true },
  { code: "uk", label: "Ukrainian", native: "Українська", locale: "uk-UA", voiceCall: true },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt", locale: "vi-VN", voiceCall: true },
  // ── AI email/SMS outreach + read-aloud (live calls not yet supported) ─────
  { code: "af", label: "Afrikaans", native: "Afrikaans", locale: "af-ZA" },
  { code: "sq", label: "Albanian", native: "Shqip", locale: "sq-AL" },
  { code: "am", label: "Amharic", native: "አማርኛ", locale: "am-ET" },
  { code: "hy", label: "Armenian", native: "Հայերեն", locale: "hy-AM" },
  { code: "az", label: "Azerbaijani", native: "Azərbaycanca", locale: "az-AZ" },
  { code: "be", label: "Belarusian", native: "Беларуская", locale: "be-BY" },
  { code: "bn", label: "Bengali", native: "বাংলা", locale: "bn-BD" },
  { code: "bs", label: "Bosnian", native: "Bosanski", locale: "bs-BA" },
  { code: "my", label: "Burmese", native: "မြန်မာ", locale: "my-MM" },
  { code: "ca", label: "Catalan", native: "Català", locale: "ca-ES" },
  { code: "et", label: "Estonian", native: "Eesti", locale: "et-EE" },
  { code: "ka", label: "Georgian", native: "ქართული", locale: "ka-GE" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", locale: "gu-IN" },
  { code: "ha", label: "Hausa", native: "Hausa", locale: "ha-NG" },
  { code: "he", label: "Hebrew", native: "עברית", locale: "he-IL" },
  { code: "is", label: "Icelandic", native: "Íslenska", locale: "is-IS" },
  { code: "ga", label: "Irish", native: "Gaeilge", locale: "ga-IE" },
  { code: "jv", label: "Javanese", native: "Basa Jawa", locale: "jv-ID" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", locale: "kn-IN" },
  { code: "kk", label: "Kazakh", native: "Қазақша", locale: "kk-KZ" },
  { code: "km", label: "Khmer", native: "ខ្មែរ", locale: "km-KH" },
  { code: "ky", label: "Kyrgyz", native: "Кыргызча", locale: "ky-KG" },
  { code: "lo", label: "Lao", native: "ລາວ", locale: "lo-LA" },
  { code: "lv", label: "Latvian", native: "Latviešu", locale: "lv-LV" },
  { code: "lt", label: "Lithuanian", native: "Lietuvių", locale: "lt-LT" },
  { code: "mk", label: "Macedonian", native: "Македонски", locale: "mk-MK" },
  { code: "ml", label: "Malayalam", native: "മലയാളം", locale: "ml-IN" },
  { code: "mr", label: "Marathi", native: "मराठी", locale: "mr-IN" },
  { code: "mn", label: "Mongolian", native: "Монгол", locale: "mn-MN" },
  { code: "ne", label: "Nepali", native: "नेपाली", locale: "ne-NP" },
  { code: "ps", label: "Pashto", native: "پښتو", locale: "ps-AF" },
  { code: "fa", label: "Persian", native: "فارسی", locale: "fa-IR" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", locale: "pa-IN" },
  { code: "sr", label: "Serbian", native: "Српски", locale: "sr-RS" },
  { code: "si", label: "Sinhala", native: "සිංහල", locale: "si-LK" },
  { code: "sl", label: "Slovenian", native: "Slovenščina", locale: "sl-SI" },
  { code: "so", label: "Somali", native: "Soomaali", locale: "so-SO" },
  { code: "sw", label: "Swahili", native: "Kiswahili", locale: "sw-KE" },
  { code: "te", label: "Telugu", native: "తెలుగు", locale: "te-IN" },
  { code: "th", label: "Thai", native: "ไทย", locale: "th-TH" },
  { code: "ur", label: "Urdu", native: "اردو", locale: "ur-PK" },
  { code: "uz", label: "Uzbek", native: "Oʻzbekcha", locale: "uz-UZ" },
  { code: "cy", label: "Welsh", native: "Cymraeg", locale: "cy-GB" },
];

/** True when live phone calls are supported in this language (not just text). */
export function voiceCallSupported(code?: string | null): boolean {
  return getLanguage(code).voiceCall === true;
}

export const DEFAULT_LANGUAGE = "en";

/** Resolve a code to a language, falling back to English for anything unknown. */
export function getLanguage(code?: string | null): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** True when `code` is a supported language (for validating user input). */
export function isLanguageCode(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
}

/**
 * Coerce a loosely-formatted value (a code, English label, native name, or
 * BCP-47 locale like "es" / "Spanish" / "Español" / "es-MX") to a supported
 * language code, or undefined if it matches none. For tolerant CSV/CRM import.
 */
export function toLanguageCode(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  const short = v.split(/[-_]/)[0]; // "es-mx" -> "es"
  const hit = LANGUAGES.find(
    (l) => l.code === v || l.code === short || l.label.toLowerCase() === v || l.native.toLowerCase() === v || l.locale.toLowerCase() === v,
  );
  return hit?.code;
}

/**
 * The language to use for a specific contact: their stored preference
 * (attributes.preferredLanguage / attributes.language) when it's a supported
 * code, otherwise the workspace fallback. Lets outreach honor a person's own
 * language even when it differs from the org default.
 */
export function contactPreferredLanguage(
  attributes: Record<string, string | number | boolean | null> | undefined,
  fallback: string,
): string {
  const raw = attributes?.preferredLanguage ?? attributes?.language;
  return (typeof raw === "string" && toLanguageCode(raw)) || fallback;
}

/** BCP-47 locale for the TTS voice, e.g. "es" → "es-ES". */
export function localeFor(code?: string | null): string {
  return getLanguage(code).locale;
}

/**
 * A drafting directive injected into the AI prompt. Empty for English (the
 * default needs no instruction), otherwise an explicit, idiomatic-language
 * order so output reads native — not translated.
 */
export function languageDirective(code?: string | null): string {
  const lang = getLanguage(code);
  if (lang.code === DEFAULT_LANGUAGE) return "";
  return `Write ENTIRELY in ${lang.label} (${lang.native}) — every word, including the subject. Use natural, idiomatic ${lang.label} the way a native speaker in sales would actually write, not a stiff translation. Match the local conventions for greetings, formality, names, currency, and punctuation.`;
}
