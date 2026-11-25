"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const HIDE = ["/admin", "/dashboard", "/settings", "/inbox", "/pipeline", "/leads", "/dialer"];

/** Site chat. Hidden inside the signed-in product so it doesn't cover the workspace. */
export function WebChat() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<{ who: "you" | "team"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  if (HIDE.some((p) => path.startsWith(p))) return null;

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setLines((prev) => [...prev, { who: "you", text: message }]);
    setBusy(true);
    try {
      const sessionId = sessionStorage.getItem("rr_chat") || crypto.randomUUID();
      sessionStorage.setItem("rr_chat", sessionId);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { reply?: string };
      setLines((prev) => [...prev, { who: "team", text: body.reply || "I couldn't answer that just now." }]);
    } catch {
      setLines((prev) => [...prev, { who: "team", text: "The chat is offline for a moment." }]);
    }
    setBusy(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? (
        <div className="mb-2 w-80 rounded-xl border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-fg">Talk to the team</p>
            <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {lines.length === 0 ? <p className="text-muted">Ask about a webinar, a demo, or booking a call.</p> : null}
            {lines.map((line, i) => (
              <p key={i} className={line.who === "you" ? "text-fg" : "text-muted"}>{line.text}</p>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm" placeholder="Message" aria-label="Message" />
            <button className="rounded-lg bg-brand-strong px-3 py-1.5 text-sm text-white" disabled={busy}>Send</button>
          </form>
        </div>
      ) : null}
      <button type="button" className="rounded-full bg-brand-strong px-4 py-2 text-sm font-medium text-white" onClick={() => setOpen((v) => !v)}>
        Chat
      </button>
    </div>
  );
}
