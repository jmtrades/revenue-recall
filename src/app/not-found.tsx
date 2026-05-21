import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="text-5xl font-semibold text-muted/50">404</div>
        <p className="mt-3 text-lg text-white">We couldn&apos;t find that.</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
