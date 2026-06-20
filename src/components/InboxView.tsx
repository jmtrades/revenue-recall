"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { InboxThread, InboxMessage } from "@/lib/queries";
import type { MessageTemplate } from "@/lib/templates";
import { fillTokens } from "@/lib/templates-fill";
import { Avatar, ChannelIcon, ChannelBadge, channelLabel, EmptyState, Button } from "@/components/ui";
import { SpeakButton } from "@/components/SpeakButton";
import { compactMoney } from "@/lib/format";

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "1d" : d < 30 ? `${d}d` : `${Math.round(d / 30)}mo`;
}

// Channels a reply can actually be sent on. A thread whose newest message was a
// call or internal note isn't directly repliable, so we fall back to email.
const SENDABLE = new Set(["email", "sms", "whatsapp", "instagram", "messenger", "telegram", "x", "linkedin"]);
function replyChannel(channel: string): string {
  return SENDABLE.has(channel) ? channel : "email";
}

export function InboxView({
  threads,
  templates = [],
  sender,
}: {
  threads: InboxThread[];
  /** Industry message templates for the reply composer (merge tokens fill from the active thread). */
  templates?: MessageTemplate[];
  sender?: { name?: string; bookingUrl?: string };
}) {
  const [activeId, setActiveId] = useState(threads[0]?.contactId ?? "");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const shown = filter === "unread" ? threads.filter((t) => t.unread) : threads;
  const active = threads.find((t) => t.contactId === activeId) ?? shown[0];
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Just-sent messages shown immediately, before the server refresh lands.
  const [optimistic, setOptimistic] = useState<Record<string, InboxMessage[]>>({});
  // Per-deal recall-enrollment feedback ("Enrolling…" / result), keyed by dealId.
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [enrollMsg, setEnrollMsg] = useState<{ dealId: string; ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function enrollInRecall(dealId: string) {
    if (enrolling) return;
    setEnrolling(dealId);
    setEnrollMsg(null);
    try {
      const res = await fetch("/api/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: "recall", scope: `deal:${dealId}` }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't enroll.");
      const ok = (typeof b.enrolled === "number" ? b.enrolled : 1) > 0;
      setEnrollMsg({ dealId, ok: true, text: ok ? "Enrolled — recall touches will send automatically." : "Already in the recall sequence." });
      router.refresh();
    } catch (e) {
      setEnrollMsg({ dealId, ok: false, text: e instanceof Error ? e.message : "Couldn't enroll." });
    } finally {
      setEnrolling(null);
    }
  }

  // Merge optimistic outbound messages with the server's, deduped by
  // direction+body so the real message from the next refresh replaces the
  // optimistic one rather than doubling it.
  const messages: InboxMessage[] = (() => {
    if (!active) return [];
    const serverKeys = new Set(active.messages.map((m) => `${m.direction}:${m.body}`));
    const pending = (optimistic[active.contactId] ?? []).filter((m) => !serverKeys.has(`${m.direction}:${m.body}`));
    return [...active.messages, ...pending];
  })();

  async function send() {
    if (!active || !draft.trim()) return;
    setSending(true);
    setError(null);
    const cid = active.contactId;
    const body = draft;
    try {
      const channel = replyChannel(active.channel);
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, contactId: cid, body }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) {
        // Show the sent message instantly; the refresh brings the real one and
        // the dedup hides this. A timer clears it as a safety net in case the
        // stored body differs slightly, so it can never linger as a duplicate.
        const msg: InboxMessage = { id: `tmp-${Date.now()}`, channel, direction: "outbound", body, at: new Date().toISOString() };
        setOptimistic((o) => ({ ...o, [cid]: [...(o[cid] ?? []), msg] }));
        setDraft("");
        router.refresh();
        setTimeout(() => setOptimistic((o) => { const next = { ...o }; delete next[cid]; return next; }), 8000);
      } else {
        // Don't fail silently (e.g. a 403 for an opted-out contact) — tell the rep.
        setError(b.error ?? "Couldn't send. Try again.");
      }
    } catch {
      setError("Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  // Nothing has come in yet — show one clear, full-width empty state rather than
  // an empty split view with a thin "No conversations" line.
  if (threads.length === 0) {
    return (
      <EmptyState
        iconName="inbox"
        title="No conversations yet"
        hint="Every reply across email, SMS, and connected social channels (WhatsApp, Instagram, Messenger, Telegram, X, LinkedIn) lands here in one thread. Connect a channel and inbound messages flow straight in."
        action={<Button href="/settings?tab=channels" variant="outline" size="sm">Connect a channel</Button>}
      />
    );
  }

  // On mobile use dynamic viewport height (dvh) so the panels don't jump when the
  // browser chrome shows/hides, and subtract less chrome so the list + thread each
  // get usable room; desktop keeps the fixed two-pane height.
  return (
    <div className="grid h-[calc(100dvh-9rem)] grid-cols-1 gap-4 md:h-[calc(100vh-12rem)] md:grid-cols-[320px_1fr]">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex gap-1 border-b border-border p-2">
          {(["all", "unread"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 rounded-lg px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No unread conversations.</p>
          ) : (
            shown.map((t) => (
              <button
                key={t.contactId}
                onClick={() => setActiveId(t.contactId)}
                className={`flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition hover:bg-surface-2 ${active?.contactId === t.contactId ? "bg-surface-2" : ""}`}
              >
                <Avatar name={t.contactName} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-fg">{t.contactName}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(t.lastAt)}</span>
                  </div>
                  <p className="truncate text-xs text-muted"><ChannelIcon channel={t.channel} size={12} className="mr-1 align-[-2px] text-muted/80" />{t.snippet}</p>
                </div>
                {t.unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        {!active ? (
          <div className="grid flex-1 place-items-center text-sm text-muted">Select a conversation</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={active.contactName} size={36} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{active.contactName}</div>
                  <div className="truncate text-xs text-muted">{active.company}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ChannelBadge channel={active.channel} />
                <Link href={`/leads/${active.contactId}`} className="shrink-0 text-sm text-brand hover:underline">View contact →</Link>
              </div>
            </div>
            {active.deal && (
              <div className="border-b border-border bg-surface-2/50">
                <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <Link href={`/deals/${active.deal.dealId}`} className="flex min-w-0 items-center gap-2 hover:underline">
                    <span className="truncate font-medium text-fg">{active.deal.title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${active.deal.stageType === "open" ? "bg-brand/10 text-brand" : active.deal.stageType === "won" ? "bg-success/10 text-success" : "bg-surface text-muted"}`}>{active.deal.stage}</span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    {active.deal.stageType === "open" && (
                      <button
                        onClick={() => enrollInRecall(active.deal!.dealId)}
                        disabled={enrolling === active.deal.dealId}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs text-fg transition hover:border-brand disabled:opacity-50"
                      >
                        {enrolling === active.deal.dealId ? "Enrolling…" : "Enroll in recall"}
                      </button>
                    )}
                    <span className="font-medium tabular-nums text-fg">{compactMoney(active.deal.value, active.deal.currency)}</span>
                  </div>
                </div>
                {enrollMsg && enrollMsg.dealId === active.deal.dealId && (
                  <p className={`px-4 pb-2 text-xs ${enrollMsg.ok ? "text-success" : "text-danger"}`}>{enrollMsg.text}</p>
                )}
              </div>
            )}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === "outbound" ? "bg-brand-strong text-white" : "bg-surface-2 text-fg"}`}>
                    <p>{m.body}</p>
                    <p className={`mt-1 flex items-center gap-1 text-[10px] ${m.direction === "outbound" ? "text-fg/70" : "text-muted"}`}><ChannelIcon channel={m.channel} size={11} /> · {timeAgo(m.at)} ago</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3">
              {(() => {
                // Templates that fit the thread's reply channel (social DMs are
                // SMS-length). Picking one fills the merge tokens from THIS
                // conversation — the contact's name/company, the rep's name and
                // booking link — so what lands in the box is ready to send.
                const chan = replyChannel(active.channel) === "email" ? "email" : "sms";
                const fitting = templates.filter((t) => t.channel === chan);
                if (fitting.length === 0) return null;
                return (
                  <select
                    value=""
                    onChange={(e) => {
                      const t = fitting.find((x) => x.id === e.target.value);
                      if (!t) return;
                      setDraft(fillTokens(t.body, { contactName: active.contactName, company: active.company, senderName: sender?.name, bookingUrl: sender?.bookingUrl }));
                    }}
                    aria-label="Insert a template"
                    className="mb-2 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-muted outline-none focus:border-brand"
                  >
                    <option value="">Insert a template…</option>
                    {fitting.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                );
              })()}
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a reply…"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
                />
                {draft.trim() && <SpeakButton text={draft} label="" />}
                <button onClick={send} disabled={sending || !draft.trim()} className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
              </div>
              {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
              <p className="mt-1.5 text-[11px] text-muted">Replies go back out on {channelLabel(replyChannel(active.channel))} when that channel is connected — otherwise logged to the timeline.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
