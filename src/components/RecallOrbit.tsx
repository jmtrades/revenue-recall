import * as React from "react";

/**
 * RecallOrbit — the brand's signature graphic device. The recall-loop mark
 * rendered bold and precise, with a few deliberate deal-nodes orbiting it on
 * fine dotted rings. No glow, no gradient, no radar scan — a crafted geometric
 * diagram of the gesture: revenue pulled back to center. Inherits the brand
 * accent (via the --color-brand token); the optional rotation is
 * reduced-motion-safe (see .rr-orbit-sweep in globals.css). Ported from the
 * Revenue Recall design system.
 */
export interface RecallOrbitProps extends React.SVGProps<SVGSVGElement> {
  /** Square size in px. Default 240. */
  size?: number;
  /** Run the sweep animation (reduced-motion-safe). Default true. */
  animated?: boolean;
}

export function RecallOrbit({ size = 240, animated = true, style, ...props }: RecallOrbitProps) {
  const pt = (a: number, r: number): [number, number] => [120 + r * Math.cos((a * Math.PI) / 180), 120 + r * Math.sin((a * Math.PI) / 180)];
  // Intentional placement — recovered (filled) and at-risk (hollow) deals.
  const nodes: { a: number; r: number; fill: number; big?: boolean }[] = [
    { a: 38, r: 106, fill: 1, big: true },
    { a: 158, r: 106, fill: 0 },
    { a: 256, r: 58, fill: 0.9 },
    { a: 322, r: 106, fill: 0.45 },
    { a: 205, r: 58, fill: 0 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" style={style} aria-hidden="true" {...props}>
      {/* fine dotted orbit rings */}
      <circle cx="120" cy="120" r="106" stroke="var(--color-brand)" strokeOpacity="0.14" strokeWidth="1" strokeDasharray="1 7" />
      <circle cx="120" cy="120" r="58" stroke="var(--color-brand)" strokeOpacity="0.22" strokeWidth="1" strokeDasharray="1 6" />

      {/* deliberate deal-nodes, slowly orbiting */}
      <g className={animated ? "rr-orbit-sweep" : undefined} style={{ transformOrigin: "120px 120px" }}>
        {nodes.map((n, i) => {
          const [x, y] = pt(n.a, n.r);
          return n.fill
            ? <circle key={i} cx={x} cy={y} r={n.big ? 4 : 3} fill="var(--color-brand)" fillOpacity={n.fill} />
            : <circle key={i} cx={x} cy={y} r="3.2" fill="var(--color-bg)" stroke="var(--color-brand)" strokeWidth="1.5" strokeOpacity="0.55" />;
        })}
      </g>

      {/* the recall loop — the brand gesture, bold and clean (crisp stroke at any scale) */}
      <g transform="translate(120 120) scale(8.6) translate(-12 -12)" fill="none" stroke="var(--color-brand)"
        strokeWidth="2.1" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5 9.2 9.2 0 0 0-6.4 2.6L3.5 8.2" />
        <path d="M3.5 3.5v4.7h4.7" />
      </g>

      {/* solid core */}
      <circle cx="120" cy="120" r="6" fill="var(--color-brand)" />
    </svg>
  );
}

/**
 * SignalWave — a compact animated equalizer/waveform. The engine working: bars
 * pulse like a live voice or a stream of touches. Inherits the brand accent.
 * Uses the existing rr-eq keyframe (reduced-motion-safe).
 */
export interface SignalWaveProps extends React.HTMLAttributes<HTMLSpanElement> {
  bars?: number;
  height?: number;
  gap?: number;
  barWidth?: number;
  animated?: boolean;
  /** Bar color (any CSS color / token). Default brand. */
  color?: string;
}

export function SignalWave({ bars = 7, height = 24, gap = 3, barWidth = 3, animated = true, color = "var(--color-brand)", style, ...props }: SignalWaveProps) {
  const peaks = [0.5, 0.85, 0.35, 1, 0.6, 0.78, 0.45, 0.9, 0.5, 0.7];
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap, height, ...style }} aria-hidden="true" {...props}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            width: barWidth,
            height: "100%",
            borderRadius: barWidth,
            background: color,
            transformOrigin: "bottom",
            transform: `scaleY(${peaks[i % peaks.length]})`,
            animation: animated ? `rr-eq ${0.9 + (i % 3) * 0.25}s var(--ease-in-out) ${i * 0.12}s infinite` : "none",
          }}
        />
      ))}
    </span>
  );
}
