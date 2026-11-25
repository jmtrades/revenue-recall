/** Meta's standard window. Inside it, a reply is RESPONSE. Outside it, only a
 *  tagged human-agent message is allowed. */
export const META_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaSendMode =
  | { messaging_type: "RESPONSE" }
  | { messaging_type: "MESSAGE_TAG"; tag: "HUMAN_AGENT" };

/**
 * Choose the legal send mode. A missing timestamp means this is a reply to a
 * message we just received, which is inside the window. An older timestamp
 * falls through to the human_agent tag instead of a silent policy rejection.
 */
export function metaSendMode(lastInboundAt?: string | null, now = Date.now()): MetaSendMode {
  if (!lastInboundAt) return { messaging_type: "RESPONSE" };
  const at = Date.parse(lastInboundAt);
  if (!Number.isFinite(at)) return { messaging_type: "RESPONSE" };
  if (now - at <= META_STANDARD_WINDOW_MS) return { messaging_type: "RESPONSE" };
  return { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" };
}
