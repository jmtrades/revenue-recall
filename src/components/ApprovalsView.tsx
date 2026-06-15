"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, ChannelIcon, channelLabel, EmptyState } from "@/components/ui";
import { SpeakButton } from "@/components/SpeakButton";
import type { OutboxChannel } from "@/lib/agent/types";

export interface ApprovalRow {
  id: string;
  contactName: string;
  dealId?: string;
  channel: OutboxChannel;
  subject?: string;
  body: string;
  source: "ai" | "template";
}

export function ApprovalsView({ rows }: { rows: ApprovalRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "dismiss") {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/agent/outbox/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed");
      setItems((x) => x.filter((i) => i.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        iconName="approvals"
        title="Inbox zero — nothing to approve"
        hint="Drafts from review-mode Autopilot tasks land here for one-click send. Create an agent in Autopilot to start the queue."
        action={<Link href="/agents" className="cta inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90">Open Autopilot</Link>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <p className="text-sm text-muted">{items.length} draft{items.length === 1 ? "" : "s"} awaiting your approval</p>
      {items.map((it) => (
        <section key={it.id} className="card">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar name={it.contactName} size={30} />
              <div>
                {it.dealId ? <Link href={`/deals/${it.dealId}`} className="text-sm font-medium text-fg hover:underline">{it.contactName}</Link> : <span className="text-sm font-medium text-fg">{it.contactName}</span>}
                <div className="flex items-center gap-1 text-xs text-muted"><ChannelIcon channel={it.channel} size={11} /> {channelLabel(it.channel)} · {it.source === "ai" ? "AI draft" : "template"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SpeakButton text={[it.subject, it.body].filter(Boolean).join(". ")} label="Hear it" />
              <button onClick={() => act(it.id, "dismiss")} disabled={busy === it.id} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-danger disabled:opacity-50">Dismiss</button>
              <button onClick={() => act(it.id, "approve")} disabled={busy === it.id} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50">
                {busy === it.id ? "Sending…" : "Approve & send"}
              </button>
            </div>
          </div>
          {it.subject && <div className="mb-1 text-sm font-medium text-fg">{it.subject}</div>}
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2.5 font-sans text-sm leading-relaxed text-muted">{it.body}</pre>
        </section>
      ))}
    </div>
  );
}
