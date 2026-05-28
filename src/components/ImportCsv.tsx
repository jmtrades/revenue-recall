"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

  function reset() {
    setPreview(null);
    setFileName(null);
    setResult(null);
    setError(null);
    setStatus("idle");
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
        body: JSON.stringify({ rows: preview.rows }),
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
            <div className="text-3xl text-muted/60">⬆</div>
            <p className="mt-2 text-sm text-white">{fileName ?? "Drop a CSV here or click to upload"}</p>
            <p className="mt-1 text-xs text-muted">Columns: name, email, phone, company, value, stage</p>
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
          <p className="text-sm text-white">
            <span className="font-medium">{preview.rows.length}</span> record{preview.rows.length === 1 ? "" : "s"} ready
            {preview.skipped > 0 && <span className="text-muted"> · {preview.skipped} skipped (no name)</span>}
          </p>
          <p className="mt-1 text-xs text-muted">
            Detected columns: {preview.headers.join(", ") || "—"}. Rows with a value or stage also create a deal.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runImport}
              disabled={status === "importing"}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
            >
              {status === "importing" ? "Importing…" : `Import ${preview.rows.length} record${preview.rows.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={reset} className="text-sm text-muted transition hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "done" && result && (
        <div className="mt-4 rounded-xl border border-success/40 bg-success/10 p-4">
          <p className="text-sm font-medium text-white">Import complete ✓</p>
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
          <button onClick={reset} className="mt-3 text-sm text-brand transition hover:text-white">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
