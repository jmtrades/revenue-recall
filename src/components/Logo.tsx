/**
 * The Revenue Recall mark — a recall loop: an arrow sweeping back around a
 * solid core. The gesture is the product (revenue that left, pulled back to
 * center); the solid dot keeps it legible at favicon size and keeps it a LOGO
 * rather than a refresh icon. One color (currentColor), stroke-geometry only,
 * so the same mark works white-on-brand (badges), brand-on-white (docs), and
 * in the SVG favicon.
 */
export function LogoMark({ size = 18, strokeWidth = 2.5, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5 9.2 9.2 0 0 0-6.4 2.6L3.5 8.2" />
      <path d="M3.5 3.5v4.7h4.7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The standard lockup badge: brand-green rounded square, white mark. Drop-in
 *  for the old "RR" text badges — same box, a real mark inside. */
export function LogoBadge({ box = 32, mark, className = "" }: { box?: number; mark?: number; className?: string }) {
  return (
    <span
      style={{ width: box, height: box }}
      className={`grid flex-none place-items-center rounded-[10px] bg-brand text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10 ${className}`}
    >
      <LogoMark size={mark ?? Math.round(box * 0.56)} />
    </span>
  );
}
