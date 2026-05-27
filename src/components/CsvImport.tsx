"use client";

import { useRef, useState } from "react";

type Row = { name: string; email?: string; phone?: string; company?: string; title?: string; value?: string };

/** Minimal CSV line parser that respects quoted fields and escaped quotes. */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const FIELDS = ["name", "email", "phone", "company", "title", "value"] as const;

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const f of FIELDS) idx[f] = header.indexOf(f);
  if (idx.name < 0) idx.name = 0; // assume first column is name when unlabeled

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const get = (f: (typeof FIELDS)[number]) => (idx[f] >= 0 ? (cols[idx[f]] ?? "").trim() : "");
    const name = get("name");
    if (!name) continue;
    rows.push({
      name,
      email: get("email") || undefined,
      phone: get("phone") || undefined,
      company: get("company") || undefined,
      title: get("title") || undefined,
      value: get("value") || undefined,
    });
  }
  return rows;
}

export function CsvImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleFile(file: File) {
    setStatus("working");
    setMessage(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setStatus("error");
        setMessage("No rows found. Make sure the first row is a header including a 'name' column.");
        return;
      }
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rows.slice(0, 1000) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Import failed.");
        return;
      }
      setStatus("done");
      setMessage(
        `Imported ${data.created} contact${data.created === 1 ? "" : "s"}` +
          (data.deals ? ` and ${data.deals} deal${data.deals === 1 ? "" : "s"}` : "") +
          (data.failed ? ` · ${data.failed} skipped` : "") +
          ". Refresh to see them.",
      );
    } catch {
      setStatus("error");
      setMessage("Could not read that file.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "working"}
        className="grid w-full place-items-center rounded-xl border border-dashed border-border py-10 text-center transition hover:border-brand/40 disabled:opacity-60"
      >
        <span className="text-3xl text-muted/60">⬆</span>
        <span className="mt-2 text-sm text-white">
          {status === "working" ? "Importing…" : "Click to upload a CSV"}
        </span>
        <span className="mt-1 text-xs text-muted">Columns: name, email, phone, company, title, value</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {message && (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            status === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : status === "done"
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-surface-2/40 text-muted"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
