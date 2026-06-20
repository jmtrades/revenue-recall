import { getSupabase } from "@/lib/supabase/client";
import { logError, logInfo, errMessage } from "@/lib/log";

/**
 * Call-recording erasure. Recordings live OUTSIDE the database — the call log
 * embeds their URL in the activity summary ("Recording: https://…"), and the
 * audio itself sits with the telephony provider (Twilio) or the operator's
 * gateway. Deleting the org row therefore erases the *pointer* but not the
 * voice recording of an identifiable person, which GDPR Art. 17 / CCPA deletion
 * explicitly covers. This module enumerates every recording URL an org's
 * timeline references and deletes the ones it can reach, BEFORE the cascade
 * wipes the pointers.
 *
 * Twilio recordings are deleted via the REST API (DELETE …/Recordings/{Sid});
 * other hosts get a best-effort HTTP DELETE. Every failure is logged with the
 * URL so an operator can finish the job by hand — an erasure request must never
 * silently leave audio behind.
 */

const RECORDING_URL = /Recording:\s*(https?:\/\/\S+)/g;

export interface RecordingPurgeResult {
  found: number;
  deleted: number;
  failed: string[];
}

/** Every distinct recording URL referenced on this org's timeline. */
export async function listOrgRecordingUrls(orgId: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("activities").select("summary").eq("org_id", orgId).ilike("summary", "%Recording: http%");
  if (error) throw new Error(`recording scan failed: ${error.message}`);
  const urls = new Set<string>();
  for (const row of (data ?? []) as { summary: string }[]) {
    for (const m of row.summary.matchAll(RECORDING_URL)) urls.add(m[1].replace(/[.,;)]+$/, ""));
  }
  return [...urls];
}

/** Twilio recording resource: …/2010-04-01/Accounts/{AccountSid}/Recordings/{RE…} */
function twilioRecordingPath(url: string): string | null {
  const m = /api\.twilio\.com\/2010-04-01\/(Accounts\/AC\w+\/Recordings\/RE\w+)/.exec(url);
  return m ? m[1] : null;
}

async function deleteOneRecording(url: string): Promise<boolean> {
  const twilioPath = twilioRecordingPath(url);
  if (twilioPath && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/${twilioPath}.json`, { method: "DELETE", headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10_000) });
    // 404 = already gone — erased is erased.
    return res.ok || res.status === 404;
  }
  // Non-Twilio host (operator gateway): best-effort authenticated DELETE.
  const headers: Record<string, string> = {};
  if (process.env.COMMS_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.COMMS_WEBHOOK_TOKEN}`;
  const res = await fetch(url, { method: "DELETE", headers, signal: AbortSignal.timeout(10_000) });
  return res.ok || res.status === 404;
}

/** Delete every recording the org's timeline references. Call BEFORE deleting
 *  the org (the cascade destroys the only index of what exists). */
export async function purgeOrgRecordings(orgId: string): Promise<RecordingPurgeResult> {
  const result: RecordingPurgeResult = { found: 0, deleted: 0, failed: [] };
  let urls: string[] = [];
  try {
    urls = await listOrgRecordingUrls(orgId);
  } catch (e) {
    logError("recordings.purge.scan_failed", { orgId, error: errMessage(e) });
    return result;
  }
  result.found = urls.length;
  for (const url of urls) {
    try {
      if (await deleteOneRecording(url)) result.deleted += 1;
      else result.failed.push(url);
    } catch (e) {
      result.failed.push(url);
      logError("recordings.purge.delete_failed", { orgId, url, error: errMessage(e) });
    }
  }
  if (result.found > 0) logInfo("recordings.purged", { orgId, ...result, failed: result.failed.length });
  return result;
}
