"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { parseImportCsv, type ParseResult } from "@/lib/import/csv";

interface ImportResult {
  contacts: number;
  deals: number;
  errorCount: number;
  errors: string[];
}

export function ImportCsv({ writable }: { writable: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  function reset() {
    setPreview(null);
    setFileName(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    setConsent(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setStatus("idle");
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseImportCsv(text);
      if (parsed.rows.length === 0) {
        setPreview(null);
        setError("No rows with a name column were found. Include a header row with at least a 'name' column.");
        return;
      }
      setPreview(parsed);
    } catch {
      setError("Could not read that file.");
    }
  }

  async function runImport() {
    if (!preview) return;
    setStatus("importing");
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows, consent }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setResult(json as ImportResult);
      setStatus("done");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }

  if (!writable) {
    return (
      <p className="text-sm text-muted">
        The active CRM is read-only, so import is disabled. Switch to the built-in CRM or connect a writable backend to
        import contacts and deals.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted">No CRM yet? Import contacts and deals from a CSV to get started instantly.</p>

      {!preview && status !== "done" && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={`mt-4 grid w-full place-items-center rounded-xl border border-dashed py-10 text-center transition ${
              dragging ? "border-brand bg-brand-soft/20" : "border-border hover:border-brand/50"
            }`}
          >
            <Icon name="upload" size={26} className="text-muted/60" />
            <p className="mt-2 text-sm text-fg">{fileName ?? "Drop a CSV here or click to upload"}</p>
            <p className="mt-1 text-xs text-muted">Columns: name, email, phone, company, value, stage, language</p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {preview && status !== "done" && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2/40 p-4">
          <p className="text-sm text-fg">
            <span className="font-medium">{preview.rows.length}</span> record{preview.rows.length === 1 ? "" : "s"} ready
            {preview.skipped > 0 && <span className="text-muted"> · {preview.skipped} skipped (no name)</span>}
          </p>
          <p className="mt-1 text-xs text-muted">
            Detected columns: {preview.headers.join(", ") || "—"}. Rows with a value or stage also create a deal.
          </p>
          <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
            <span className="text-muted">
              <span className="font-medium text-fg">I have prior express consent to call and text these contacts.</span>{" "}
              Checking this records consent on each lead so the AI can dial them autonomously. Leave it unchecked if you’re not sure — you can record consent later from the Leads page.
            </span>
          </label>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runImport}
              disabled={status === "importing"}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
            >
              {status === "importing" ? "Importing…" : `Import ${preview.rows.length} record${preview.rows.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={reset} className="text-sm text-muted transition hover:text-fg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "done" && result && (
        <div className="mt-4 rounded-xl border border-success/40 bg-success/10 p-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-fg"><Icon name="check" size={14} strokeWidth={3} className="text-success" /> Import complete</p>
          <p className="mt-1 text-sm text-muted">
            {result.contacts} contact{result.contacts === 1 ? "" : "s"} and {result.deals} deal
            {result.deals === 1 ? "" : "s"} created.
            {result.errorCount > 0 && <span className="text-warn"> {result.errorCount} row(s) failed.</span>}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {result.errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
          <button onClick={reset} className="mt-3 text-sm text-brand transition hover:text-fg">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
