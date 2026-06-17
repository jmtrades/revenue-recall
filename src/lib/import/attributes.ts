/**
 * Build the attributes for an imported contact. Two optional concerns:
 * - preferred language (already resolved to a code by the caller)
 * - call/SMS consent: stamped ONLY when the importer explicitly affirms they
 *   hold prior express consent for the list (a deliberate compliance act — never
 *   a default), so the autopilot can dial/text them without a separate step.
 * Pure + tested; returns undefined when there's nothing to set.
 */
export type ContactAttributes = Record<string, string | number | boolean | null>;

export function importContactAttributes(
  language: string | undefined,
  consent: boolean | undefined,
  now: string,
): ContactAttributes | undefined {
  const a: ContactAttributes = {};
  if (language) a.preferredLanguage = language;
  if (consent) {
    a.callConsent = true;
    a.callConsentAt = now;
    a.smsConsent = true;
    a.smsConsentAt = now;
    a.consentAt = now;
  }
  return Object.keys(a).length ? a : undefined;
}
