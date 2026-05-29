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
}

export const LANGUAGES: Language[] = [
  { code: "en", label: "English", native: "English", locale: "en-US" },
  { code: "es", label: "Spanish", native: "Español", locale: "es-ES" },
  { code: "fr", label: "French", native: "Français", locale: "fr-FR" },
  { code: "de", label: "German", native: "Deutsch", locale: "de-DE" },
  { code: "pt", label: "Portuguese", native: "Português", locale: "pt-BR" },
  { code: "it", label: "Italian", native: "Italiano", locale: "it-IT" },
  { code: "nl", label: "Dutch", native: "Nederlands", locale: "nl-NL" },
  { code: "pl", label: "Polish", native: "Polski", locale: "pl-PL" },
  { code: "ja", label: "Japanese", native: "日本語", locale: "ja-JP" },
  { code: "zh", label: "Chinese", native: "中文", locale: "zh-CN" },
  { code: "ko", label: "Korean", native: "한국어", locale: "ko-KR" },
  { code: "ar", label: "Arabic", native: "العربية", locale: "ar-SA" },
  { code: "hi", label: "Hindi", native: "हिन्दी", locale: "hi-IN" },
];

export const DEFAULT_LANGUAGE = "en";

/** Resolve a code to a language, falling back to English for anything unknown. */
export function getLanguage(code?: string | null): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** True when `code` is a supported language (for validating user input). */
export function isLanguageCode(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
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
