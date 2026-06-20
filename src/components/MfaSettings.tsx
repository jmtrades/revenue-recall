"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

interface Factor {
  id: string;
  status: string;
  friendlyName?: string;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * Optional TOTP two-factor auth, via Supabase's auth.mfa API (fully client-side
 * — no server route or table needed). Enterprise security questionnaires
 * commonly require it. If MFA isn't enabled on the project, enroll() errors and
 * we surface that rather than break.
 */
export function MfaSettings() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const { data, error } = await getBrowserSupabase().auth.mfa.listFactors();
      if (error) {
        setFactors([]);
        return;
      }
      setFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status, friendlyName: f.friendly_name ?? undefined })));
    } catch {
      setFactors([]);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  async function startEnroll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error } = await getBrowserSupabase().auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code });
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!enroll) return;
    setBusy(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const ch = await sb.auth.mfa.challenge({ factorId: enroll.id });
      if (ch.error) throw ch.error;
      const v = await sb.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.data.id, code: code.trim() });
      if (v.error) throw v.error;
      setEnroll(null);
      setCode("");
      setNotice("Two-factor authentication is on.");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error } = await getBrowserSupabase().auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      setNotice("Two-factor authentication removed.");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-fg">Two-factor authentication</p>
        <p className="mt-0.5 text-xs text-muted">Add an authenticator-app code on top of your password. Recommended for admins.</p>
      </div>

      {factors === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : verified.length > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/[0.06] px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-success">2FA is on</span>
          <button onClick={() => disable(verified[0].id)} disabled={busy} className={`${btn} border border-border text-muted hover:text-fg`}>Remove</button>
        </div>
      ) : enroll ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-fg">Scan this with your authenticator app, then enter the 6-digit code.</p>
          {/* Supabase returns the QR as an SVG data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="2FA QR code" className="my-3 h-40 w-40 rounded bg-white p-2" />
          <div className="flex items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" aria-label="Verification code" placeholder="123456" className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand" />
            <button onClick={confirmEnroll} disabled={busy || code.trim().length < 6} className={`${btn} bg-brand-strong text-white hover:bg-brand-strong/90`}>{busy ? "Verifying…" : "Verify & enable"}</button>
            <button onClick={() => { setEnroll(null); setCode(""); }} className="text-xs text-muted hover:text-fg">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={startEnroll} disabled={busy} className={`${btn} border border-border text-fg hover:bg-surface-2`}>{busy ? "Starting…" : "Enable 2FA"}</button>
      )}

      {notice && <p className="text-sm text-success">{notice}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
