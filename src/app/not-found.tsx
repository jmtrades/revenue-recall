import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="font-display text-7xl font-semibold tracking-tight text-brand/30">404</div>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-fg">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">The link may be broken or the page may have moved. Let&apos;s get you back on track.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="cta inline-flex items-center rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong/90">
            Go to dashboard
          </Link>
          <Link href="/" className="cta inline-flex items-center rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
