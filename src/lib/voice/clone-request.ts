/** Instant Voice Clone request checks. Pure so the route and the tests share them. */

export const MAX_CLONE_SAMPLES = 25;
export const MAX_CLONE_BYTES = 10 * 1024 * 1024;

export function validateCloneRequest(input: { name: string; fileCount: number; consent: boolean; tooLarge?: boolean }): string | null {
  if (!input.consent) return "Confirm the speaker agreed to this clone.";
  if (!input.name.trim()) return "Give your voice a name.";
  if (input.name.trim().length > 80) return "Keep the name under 80 characters.";
  if (input.fileCount < 1) return "Add at least one audio sample.";
  if (input.fileCount > MAX_CLONE_SAMPLES) return `Up to ${MAX_CLONE_SAMPLES} samples.`;
  if (input.tooLarge) return "Each sample must be under 10 MB.";
  return null;
}
