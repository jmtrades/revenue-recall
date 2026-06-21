"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { SUGGESTED_QUESTIONS, HELP_GREETING } from "@/lib/help/knowledge";

/**
 * Site-wide help assistant. A floating launcher that opens a chat panel which
 * answers questions about Revenue Recall — grounded server-side so it speaks
 * only from real product facts. Mounted once in the root layout, so it rides
 * along on every page (marketing and the signed-in app alike).
 *
 * The panel is purely presentational state; all knowledge + the AI call live in
 * /api/help/chat, which degrades to a curated answer with no API key configured.
 */

type Msg = { role: "user" | "assistant"; content: string };

const ERROR_REPLY = "Sorry — I hit a snag answering that. Please try again in a moment, or open Go Live in the sidebar for the setup checklist.";

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Focus the input when the panel opens; close on Escape.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-24) }),
      });
      if (!res.ok) {
        const tooMany = res.status === 429;
        setMessages((m) => [...m, { role: "assistant", content: tooMany ? "I'm getting a lot of questions right now — give me a few seconds and try again." : ERROR_REPLY }]);
        return;
      }
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply?.trim() || ERROR_REPLY }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: ERROR_REPLY }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close help assistant" : "Open help assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 grid place-items-center rounded-full bg-brand-strong text-white shadow-lg shadow-brand-strong/30 transition hover:bg-brand-strong/90 active:scale-95"
        style={{ height: 52, width: 52 }}
      >
        <Icon name={open ? "close" : "message"} size={22} />
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Revenue Recall help assistant"
          className="fixed bottom-20 right-5 z-40 flex max-h-[min(36rem,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:w-[24rem]"
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-border bg-surface-2/60 px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-brand">
              <Icon name="message" size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">Help assistant</p>
              <p className="truncate text-xs text-muted">Ask anything about Revenue Recall</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-fg">
              <Icon name="close" size={16} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <Bubble role="assistant" content={HELP_GREETING} />
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {busy && (
              <div className="flex items-center gap-1.5 px-1 text-muted" aria-label="Assistant is typing">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60" />
              </div>
            )}
          </div>

          {/* Suggested questions (only before the first exchange) */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-brand/40 hover:text-fg"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-border px-3 py-2.5"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Ask the help assistant a question"
              maxLength={2000}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted/70 focus:border-brand/50"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-strong text-white transition hover:bg-brand-strong/90 disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-strong px-3.5 py-2 text-sm leading-relaxed text-white"
            : "max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2 text-sm leading-relaxed text-fg"
        }
      >
        {content}
      </div>
    </div>
  );
}
