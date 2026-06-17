/**
 * Whether an inbound reply may be AUTO-SENT (vs. queued for human approval).
 * Mirrors the outbound engine's compliance gates so the reply-autopilot can't
 * bypass them: email needs a verified sending domain (CAN-SPAM), SMS needs A2P
 * platform readiness AND the prospect's 8am–9pm courtesy window (TCPA). Per-
 * contact SMS consent is NOT required here — the prospect messaged us first,
 * which is itself consent to reply. When compliance enforcement is off, the
 * readiness flags are true and only the SMS courtesy window applies. Pure + tested.
 */
export function inboundAutoSendAllowed(opts: {
  channel: string;
  /** Sending domain verified (or compliance enforcement off). */
  emailReady: boolean;
  /** A2P registered (or compliance enforcement off). */
  smsPlatformReady: boolean;
  /** The SMS reply would land outside the prospect's local courtesy window. */
  smsCourtesyBlocked: boolean;
}): boolean {
  if (opts.channel === "email") return opts.emailReady;
  // Everything else auto-sends over SMS (sendSms): gate on platform + courtesy.
  return opts.smsPlatformReady && !opts.smsCourtesyBlocked;
}
