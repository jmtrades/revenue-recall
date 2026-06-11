"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

/**
 * Last-resort error boundary. Next's per-route error.tsx can't catch an error
 * thrown in the ROOT layout itself — only global-error can, and it must render
 * its own <html>/<body>. Without this, such an error shows the framework's bare
 * white crash screen; with it, the user always gets a branded, recoverable page.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError({ message: error.message, stack: error.stack, digest: error.digest, source: "boundary" });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0b", color: "#e8e8ea" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem", textAlign: "center" }}>
          <div style={{ maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Something went wrong</h1>
            <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#9a9aa2", margin: "0 0 1.5rem" }}>
              An unexpected error occurred. You can retry, or head back to your dashboard.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{ borderRadius: "9999px", background: "#16a34a", color: "#fff", border: "none", padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
              >
                Try again
              </button>
              <a
                href="/dashboard"
                style={{ borderRadius: "9999px", border: "1px solid #2a2a2e", color: "#e8e8ea", padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
              >
                Dashboard
              </a>
            </div>
            {error.digest && <p style={{ marginTop: "1.25rem", fontFamily: "monospace", fontSize: "0.6875rem", color: "#6a6a72" }}>Ref: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
