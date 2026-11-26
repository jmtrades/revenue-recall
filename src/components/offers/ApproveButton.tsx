"use client";

export function ApproveButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="mt-2 rounded-full border border-border px-3 py-1 text-xs font-medium"
      onClick={() => {
        void fetch("/api/offers/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
      }}
    >
      Approve draft
    </button>
  );
}
