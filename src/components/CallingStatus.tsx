"use client";

import { useResource } from "@/lib/useResource";

interface Channel {
  provider: string;
  live: boolean;
}
interface Gateway {
  reachable: boolean;
  misdirected?: boolean;
  status?: string;
  voice?: boolean;
  brain?: boolean;
  twilio?: boolean;
  transport?: string;
  detail?: string;
}
interface Diagnostics {
  channels: { email: Channel; sms: Channel; voice: Channel };
  voiceConfigured: boolean;
  gatewayUrl: string | null;
  gateway: Gateway | null;
}

const dot = (ok: boolean) => `inline-block h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-danger"}`;

function Sub({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={dot(ok)} /> {label}
    </span>
  );
}

/** Live check that outbound calls/texts are actually wired — it pings the
 *  gateway, so a misconfigured URL shows red instead of a false green. */
export function CallingStatus() {
  // Fetched via useResource (no-store default): aborts on unmount, ignores
  // stale responses, and reload() drives the "Re-check" button.
  const { data: d, loading, error, reload } = useResource<Diagnostics>(
    "/api/calls/diagnostics",
    (json) => json as Diagnostics,
  );

  const g = d?.gateway;
  const voiceLine: { ok: boolean; text: string; detail?: string; steps?: string[] } = !d
    ? { ok: false, text: "—" }
    : !d.voiceConfigured
      ? {
          ok: false,
          text: "Not wired",
          detail: "Calls aren't pointed at a gateway yet.",
          steps: [
            "In Vercel, set VOICE_WEBHOOK_URL to your gateway's URL ending in /voice.",
            "Use the Render service's own https://<name>.onrender.com/voice — no custom domain or DNS needed.",
          ],
        }
      : g?.misdirected
        ? { ok: false, text: "Wrong URL", detail: g.detail }
        : g?.reachable
          ? { ok: true, text: "Gateway reachable" }
          : {
              ok: false,
              text: "Gateway unreachable",
              detail: "VOICE_WEBHOOK_URL is set, but nothing answers at that address.",
              steps: [
                "Open Render → your call-stack web service. No service in the list? It was never deployed — deploy the image first; Render then gives it a URL.",
                "Service shows “Live”? Copy its https://<name>.onrender.com address and set VOICE_WEBHOOK_URL = https://<that-host>/voice.",
                "Avoid a custom domain (calls.yourdomain.com) unless you've added its DNS record — the onrender.com URL always resolves.",
              ],
            };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="stat-label">Calls &amp; texts — live status</p>
        <button onClick={() => reload()} disabled={loading} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50">
          {loading ? "Checking…" : "Re-check"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger">Couldn&apos;t load status — try Re-check.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {/* SMS */}
          <li className="flex items-center justify-between px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-sm text-fg">
              <span className={dot(Boolean(d?.channels.sms.live))} /> Texts (SMS)
            </span>
            <span className="text-xs text-muted">{d ? (d.channels.sms.live ? `Live · ${d.channels.sms.provider}` : "Logging only") : "…"}</span>
          </li>
          {/* Voice */}
          <li className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm text-fg">
                <span className={dot(voiceLine.ok)} /> Calls (voice)
              </span>
              <span className={`text-xs ${voiceLine.ok ? "text-success" : "text-muted"}`}>{voiceLine.text}</span>
            </div>
            {voiceLine.detail && <p className="mt-1.5 text-xs text-danger/90">{voiceLine.detail}</p>}
            {voiceLine.steps && (
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs text-muted">
                {voiceLine.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {g?.reachable && !g.misdirected && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Sub ok={Boolean(g.voice)} label="neural voice" />
                <Sub ok={Boolean(g.brain)} label="brain" />
                <Sub ok={Boolean(g.twilio)} label="Twilio trunk" />
                {g.transport && <span className="text-xs text-muted">· {g.transport}</span>}
              </div>
            )}
            {g?.reachable && !g.misdirected && !g.twilio && (
              <p className="mt-1.5 text-xs text-muted">Gateway is up, but set <span className="font-mono">PUBLIC_WSS_BASE</span> (+ Twilio keys) on it to place calls.</p>
            )}
          </li>
        </ul>
      )}

      {d?.gatewayUrl && <p className="truncate font-mono text-[11px] text-muted/70">{d.gatewayUrl}</p>}
    </div>
  );
}
