"use client";

import { analyzeHumanness } from "@/lib/humanness";

/**
 * Live "does this sound human?" check shown under a compose box. Reruns on every
 * keystroke (the analyzer is pure + cheap) so reps can fix AI-sounding copy
 * before it ever goes out.
 */
export function HumannessMeter({ text }: { text: string }) {
  if (!text.trim()) return null;
  const r = analyzeHumanness(text);

  const tone =
    r.rating === "human"
      ? { label: "Sounds human", text: "text-success", bar: "bg-success" }
      : r.rating === "stiff"
        ? { label: "A little stiff", text: "text-warn", bar: "bg-warn" }
        : { label: "Sounds like AI", text: "text-danger", bar: "bg-danger" };

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${tone.text}`}>{tone.label}</span>
        <span className="tabular-nums text-muted">{r.score}/100 human</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className={`h-full transition-all ${tone.bar}`} style={{ width: `${r.score}%` }} />
      </div>
      {r.flags.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] leading-relaxed text-muted">
          {r.flags.slice(0, 4).map((f, i) => (
            <li key={i}>
              • <span className="text-white">&ldquo;{f.text}&rdquo;</span> — {f.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
