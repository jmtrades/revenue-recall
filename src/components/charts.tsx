/**
 * Dependency-free SVG charts. Server-renderable, theme-aware, deterministic.
 * BRAND resolves to the org's accent via the --brand-rgb CSS variable set on the
 * app shell, so charts re-color with the chosen theme.
 */
import { useId } from "react";

const BRAND = "rgb(var(--brand-rgb))";
const GRID = "rgb(var(--border-rgb))";

export function Sparkline({ data, width = 120, height = 32, color = BRAND }: { data: number[]; width?: number; height?: number; color?: string }) {
  const gid = useId();
  if (data.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((d, i) => [i * step, height - ((d - min) / range) * (height - 6) - 3] as const);
  const points = pts.map(([x, y]) => `${x},${y}`);
  const path = `M ${points.join(" L ")}`;
  const area = `${path} L ${width},${height} L 0,${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.75} fill={color} />
      <circle cx={lx} cy={ly} r={5} fill={color} opacity={0.18} />
    </svg>
  );
}

export function Donut({
  segments,
  size = 160,
  thickness = 18,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="space-y-1.5">
        {centerLabel && (
          <div className="mb-2">
            <div className="text-xl font-semibold text-fg">{centerLabel}</div>
            {centerSub && <div className="text-xs text-muted">{centerSub}</div>}
          </div>
        )}
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto tabular-nums text-fg">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ stages }: { stages: { label: string; value: number; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const w = Math.max(8, (s.value / max) * 100);
        const conv = i > 0 && stages[i - 1].count > 0 ? Math.round((s.count / stages[i - 1].count) * 100) : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-muted">{s.label}</span>
            <div className="flex h-9 flex-1 items-center">
              <div
                className="flex h-full items-center justify-end rounded-md px-2.5"
                style={{
                  width: `${w}%`,
                  background: "linear-gradient(to right, rgb(var(--brand-rgb) / 0.4), rgb(var(--brand-rgb) / 0.9))",
                  boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.12)",
                }}
              >
                <span className="text-xs font-semibold tabular-nums text-white">{s.count}</span>
              </div>
            </div>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{conv !== null ? `${conv}%` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BarChart({ data, height = 160, color = BRAND }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2.5" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-2">
          <div
            className="w-full rounded-t-md"
            style={{
              height: `${Math.max(2, (d.value / max) * (height - 26))}px`,
              background: `linear-gradient(to top, color-mix(in srgb, ${color} 32%, transparent), ${color})`,
              boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.18)",
            }}
            title={String(d.value)}
          />
          <span className="truncate text-[10px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressRing({ value, size = 64, thickness = 7, color = BRAND }: { value: number; size?: number; thickness?: number; color?: string }) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${circ * pct} ${circ}`} />
      <text x={c} y={c} transform={`rotate(90 ${c} ${c})`} textAnchor="middle" dominantBaseline="central" fill="rgb(var(--fg-rgb))" fontSize={size * 0.24} fontWeight={600}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

export function MiniLegendBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="text-fg">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
