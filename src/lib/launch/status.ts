import { gatewayDiagnostics } from "@/lib/calls/diagnostics";
import { isAiConfigured } from "@/lib/ai/client";
import { getOrgSettings } from "@/lib/org";
import { isEntitled } from "@/lib/billing/enforce";
import { resolveProvider } from "@/lib/crm/registry";
import { listTasks, listRuns } from "@/lib/agent/store";
import { hasCallConsent } from "@/lib/agent/guardrails";
import { goLiveStatus, type GoLiveStatus } from "@/lib/launch/go-live";

/**
 * Assemble the live "Go Live" status from the real configuration — the same
 * checks scattered across diagnostics, billing, org settings, and the agent
 * store, collapsed into one honest answer to "can the AI call my leads, and
 * what's blocking it?".
 */
export async function getGoLiveStatus(): Promise<GoLiveStatus> {
  const [diag, org, autopilotEntitled, contacts, tasks, runs] = await Promise.all([
    gatewayDiagnostics().catch(() => null),
    getOrgSettings().catch(() => null),
    isEntitled("autopilot").catch(() => false),
    resolveProvider().then((p) => p.listContacts()).catch(() => []),
    listTasks().catch(() => []),
    listRuns(undefined, 1).catch(() => []),
  ]);

  return goLiveStatus({
    phoneConnected: Boolean(diag?.channels.voice.live),
    gatewayReachable: diag?.gateway ? diag.gateway.reachable : null,
    gatewayMisdirected: Boolean(diag?.gateway?.misdirected),
    voiceReady: Boolean(org?.voiceId || org?.ttsVoiceId),
    // The live-call conversation brain runs in the call-gateway (its own key), so
    // trust the gateway's /health report when a gateway is configured; only fall
    // back to the app's Anthropic key when there's no gateway (direct path).
    brainReady: diag?.gateway ? Boolean(diag.gateway.brain) : isAiConfigured(),
    leadCount: contacts.length,
    consentCount: contacts.filter((c) => hasCallConsent(c)).length,
    autopilotEntitled,
    sendingPaused: Boolean(org?.sendingPaused),
    enabledAutoTasks: tasks.filter((t) => t.enabled && t.autonomy === "auto").length,
    lastRunAt: runs[0]?.startedAt ?? null,
    now: new Date().toISOString(),
  });
}
