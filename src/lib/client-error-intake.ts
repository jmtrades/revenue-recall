import { z } from "zod";

/**
 * Schema + validation for the browser-error intake (/api/client-error). Lives
 * outside the route file because Next route modules may only export route
 * fields — and the parser needs to be importable by tests.
 */
const Body = z.object({
  message: z.string().min(1).max(300),
  stack: z.string().max(2000).optional(),
  source: z.enum(["boundary", "window", "rejection"]).optional(),
  digest: z.string().max(64).optional(),
  url: z.string().max(200).optional(),
});

export type ClientErrorIntake = z.infer<typeof Body>;

/** Validate + clamp an intake payload; null when it isn't a usable report. */
export function parseClientError(raw: unknown): ClientErrorIntake | null {
  const parsed = Body.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
