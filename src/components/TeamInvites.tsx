"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INVITE_ROLES, type InviteRole, type Invitation } from "@/lib/invites";

export function TeamInvites({ initial, persisted }: { initial: Invitation[]; persisted: boolean }) {
  const router = useRouter();
  const [invites, setInvites] = useState<Invitation[]>(initial);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<InviteRole>("rep");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyLink(i: Invitation) {
    if (!i.link) return;
    // Absolute URL so a hand-shared link works from anywhere, even though the
    // API may hand back a relative one when NEXT_PUBLIC_SITE_URL isn't set.
    const url = i.link.startsWith("http") ? i.link : `${window.location.origin}${i.link}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers / insecure contexts have no clipboard API — fall back.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
    setCopiedId(i.id);
    setTimeout(() => setCopiedId((cur) => (cur === i.id ? null : cur)), 1800);
  }

  async function send() {
    if (!emails.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Couldn't send invites.");
      } else {
        const added: Invitation[] = data.invites ?? [];
        // Merge, newest first, de-duped by email.
        const byEmail = new Map(invites.map((i) => [i.email, i]));
        for (const a of added) byEmail.set(a.email, a);
        setInvites([...byEmail.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setEmails("");
        setMsg(added.length ? `Invited ${added.length} ${added.length === 1 ? "person" : "people"}.` : "No new invites — they may already be on the team.");
        router.refresh();
      }
    } catch {
      setMsg("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    // Confirm before an irreversible, one-click action: revoking invalidates the
    // teammate's invite link immediately.
    const invite = invites.find((i) => i.id === id);
    if (!window.confirm(`Revoke the invite for ${invite?.email ?? "this teammate"}? Their invite link will stop working.`)) return;
    setInvites((cur) => cur.filter((i) => i.id !== id));
    try {
      await fetch(`/api/invites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      router.refresh();
    } catch {
      /* optimistic; refresh will reconcile */
    }
  }

  const input = "rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-brand";

  return (
    <div>
      <div className="rounded-xl border border-border bg-surface-2/40 p-4">
        <p className="text-sm font-medium text-fg">Invite teammates</p>
        <p className="mt-0.5 text-xs text-muted">
          Add emails (comma, space, or newline separated). They&apos;ll get a link, and joining puts them straight into this workspace. No email set up yet? Copy each invite link below and send it yourself.
        </p>
        <textarea
          className={`${input} mt-3 w-full`}
          rows={2}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="pat@acme.com, robin@acme.com"
          disabled={!persisted}
        />
        <div className="mt-3 flex items-center gap-2">
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as InviteRole)} disabled={!persisted}>
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
          <button
            onClick={send}
            disabled={busy || !persisted || !emails.trim()}
            className="rounded-lg bg-brand-strong px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send invites"}
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
        {!persisted && <p className="mt-2 text-xs text-warn">Connect a database to invite teammates.</p>}
      </div>

      {invites.length > 0 && (
        <div className="mt-4">
          <p className="stat-label">Pending invites</p>
          <ul className="mt-2 divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm text-fg">{i.email}</span>
                  <span className="ml-2 pill bg-surface-2 capitalize text-muted">{i.role}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {i.link && (
                    <button
                      onClick={() => copyLink(i)}
                      title="Copy this teammate's invite link to share by hand"
                      className={`text-xs transition ${copiedId === i.id ? "text-success" : "text-brand hover:text-brand/80"}`}
                    >
                      {copiedId === i.id ? "Copied" : "Copy link"}
                    </button>
                  )}
                  <button onClick={() => revoke(i.id)} className="text-xs text-muted transition hover:text-danger">
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
