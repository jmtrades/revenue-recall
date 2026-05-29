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
