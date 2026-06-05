"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

interface Meta {
  defaultStageId: string;
  currency: string;
  terminology: { contact: string; opportunity: string; value: string };
  stages: { id: string; label: string; type: string }[];
  contacts: { id: string; name: string; company: string }[];
  owners: { id: string; name: string }[];
}

export function QuickCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"deal" | "contact">("deal");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // deal fields
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState("");
  // contact fields
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open || meta) return;
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Meta | null) => {
        if (!m || !Array.isArray(m.contacts)) { setError("Couldn't load — close and try again."); return; }
        setMeta(m);
        setStageId(m.defaultStageId);
        setContactId(m.contacts[0]?.id ?? "");
      })
      .catch(() => setError("Couldn't load — close and try again."));
  }, [open, meta]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function reset() {
    setTitle(""); setValue(""); setName(""); setCompany(""); setEmail(""); setPhone(""); setError(null);
  }

  async function submitDeal() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, contactId, value: Number(value) || 0, stageId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setOpen(false); reset();
      router.push(`/deals/${body.opportunity.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitContact() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, phone }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setOpen(false); reset();
      router.push(`/leads/${body.contact.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90">
        <Icon name="plus" size={16} /> New
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Quick create" className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex border-b border-border">
              {(["deal", "contact"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-3 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-brand text-fg" : "text-muted hover:text-fg"}`}>
                  New {t === "deal" ? meta?.terminology.opportunity ?? "Deal" : meta?.terminology.contact ?? "Contact"}
                </button>
              ))}
            </div>

            <div className="space-y-3 p-4">
              {!meta ? (
                <p className={`py-6 text-center text-sm ${error ? "text-danger" : "text-muted"}`}>{error ?? "Loading…"}</p>
              ) : tab === "deal" ? (
                <>
                  <input className={inputCls} placeholder="Deal title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                    {meta.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>)}
                  </select>
                  <div className="flex gap-3">
                    <input className={inputCls} type="number" placeholder={`${meta.terminology.value} (${meta.currency})`} value={value} onChange={(e) => setValue(e.target.value)} />
                    <select className={inputCls} value={stageId} onChange={(e) => setStageId(e.target.value)}>
                      {meta.stages.filter((s) => s.type !== "lost").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <button onClick={submitDeal} disabled={busy || !title.trim() || !contactId} className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {busy ? "Creating…" : `Create ${meta.terminology.opportunity}`}
                  </button>
                </>
              ) : (
                <>
                  <input className={inputCls} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                  <input className={inputCls} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
                  <input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input className={inputCls} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <button onClick={submitContact} disabled={busy || !name.trim()} className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {busy ? "Creating…" : `Create ${meta.terminology.contact}`}
                  </button>
                </>
              )}
              {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
