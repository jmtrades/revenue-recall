"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { InboxThread } from "@/lib/queries";
import { Avatar, ChannelIcon, ChannelBadge, channelLabel, EmptyState, Button } from "@/components/ui";

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

export function InboxView({ threads }: { threads: InboxThread[] }) {
  const [activeId, setActiveId] = useState(threads[0]?.contactId ?? "");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const shown = filter === "unread" ? threads.filter((t) => t.unread) : threads;
  const active = threads.find((t) => t.contactId === activeId) ?? shown[0];
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function send() {
    if (!active || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const channel = replyChannel(active.channel);
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, contactId: active.contactId, body: draft }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) {
        setDraft("");
        router.refresh();
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

  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
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
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={active.contactName} size={36} />
                <div>
                  <div className="text-sm font-medium text-fg">{active.contactName}</div>
                  <div className="text-xs text-muted">{active.company}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ChannelBadge channel={active.channel} />
                <Link href={`/leads/${active.contactId}`} className="text-sm text-brand hover:underline">View contact →</Link>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {active.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === "outbound" ? "bg-brand text-white" : "bg-surface-2 text-white"}`}>
                    <p>{m.body}</p>
                    <p className={`mt-1 flex items-center gap-1 text-[10px] ${m.direction === "outbound" ? "text-fg/70" : "text-muted"}`}><ChannelIcon channel={m.channel} size={11} /> · {timeAgo(m.at)} ago</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a reply…"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
                />
                <button onClick={send} disabled={sending || !draft.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
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
