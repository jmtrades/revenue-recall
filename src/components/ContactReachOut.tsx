"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeqOption = { id: string; name: string };

/**
 * Manual speed-to-lead from a contact's page: fire off a one-off email/text, or
 * drop the contact into a follow-up sequence — without first creating a deal.
 * Both actions hit the same opt-out-respecting paths the rest of the app uses;
 * the server is the source of truth, so errors (opted out, no channel) surface
 * inline here.
 */
export function ContactReachOut({
  contactId,
  canEmail,
  canText,
  sequences,
}: {
  contactId: string;
  canEmail: boolean;
  canText: boolean;
  sequences: SeqOption[];
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<"email" | "sms">(canEmail ? "email" : "sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [seqId, setSeqId] = useState(sequences[0]?.id ?? "");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canSend = canEmail || canText;

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, contactId, subject: channel === "email" ? subject || undefined : undefined, body }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Send failed");
      setSubject("");
      setBody("");
      setSendMsg({ ok: true, text: channel === "email" ? "Email sent." : "Text sent." });
      router.refresh();
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : "Send failed" });
    } finally {
      setSending(false);
    }
  }

  async function enrollContact() {
    if (!seqId || enrolling) return;
    setEnrolling(true);
    setEnrollMsg(null);
    try {
      const res = await fetch("/api/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: seqId, scope: `contact:${contactId}` }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Enroll failed");
      const added = typeof b.enrolled === "number" ? b.enrolled : null;
      setEnrollMsg({
        ok: true,
        text: added === 0 ? "Already in this sequence." : "Added to the sequence — follow-ups will go out automatically.",
      });
      router.refresh();
    } catch (e) {
      setEnrollMsg({ ok: false, text: e instanceof Error ? e.message : "Enroll failed" });
    } finally {
      setEnrolling(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";
  const tab = (active: boolean) => `rounded-lg px-2.5 py-1 text-xs ${active ? "bg-brand-strong text-white" : "bg-surface-2 text-muted hover:text-fg"}`;

  return (
    <div className="space-y-5">
      {canSend ? (
        <div>
          {canEmail && canText && (
            <div className="mb-2 flex gap-1">
              <button onClick={() => setChannel("email")} className={tab(channel === "email")}>Email</button>
              <button onClick={() => setChannel("sms")} className={tab(channel === "sms")}>Text</button>
            </div>
          )}
          {channel === "email" && (
            <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Email subject" placeholder="Subject (optional)" className={`${input} mb-2`} />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Message"
            placeholder={channel === "email" ? "Write a quick email…" : "Write a quick text…"}
            rows={4}
            className={`${input} resize-none`}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={send}
              disabled={sending || !body.trim()}
              className="rounded-lg bg-brand-strong px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
            >
              {sending ? "Sending…" : `Send ${channel === "email" ? "email" : "text"}`}
            </button>
            {sendMsg && <span className={`text-xs ${sendMsg.ok ? "text-success" : "text-danger"}`}>{sendMsg.text}</span>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Add an email or phone number to message this contact.</p>
      )}

      {sequences.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="stat-label">Add to a sequence</p>
          <div className="mt-2 flex items-center gap-2">
            <select value={seqId} onChange={(e) => setSeqId(e.target.value)} aria-label="Sequence to enroll in" className={input}>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={enrollContact}
              disabled={enrolling || !seqId}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-fg transition hover:border-brand disabled:opacity-50"
            >
              {enrolling ? "Adding…" : "Enroll"}
            </button>
          </div>
          {enrollMsg && <p className={`mt-2 text-xs ${enrollMsg.ok ? "text-success" : "text-danger"}`}>{enrollMsg.text}</p>}
        </div>
      )}
    </div>
  );
}
