import Link from "next/link";

export function AnnouncementBar() {
  return (
    <Link
      href="#roi"
      className="group block border-b border-border/60 bg-brand-soft/30 transition hover:bg-brand-soft/50"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-5 py-2 text-xs sm:text-sm">
        <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          New
        </span>
        <span className="text-muted">See exactly how much revenue you can win back</span>
        <span className="font-medium text-white transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}
