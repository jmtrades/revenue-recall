import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="text-5xl font-semibold text-muted/50">404</div>
        <p className="mt-3 text-lg text-fg">We couldn&apos;t find that.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/dashboard" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
            Go to dashboard
          </Link>
          <Link href="/" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
