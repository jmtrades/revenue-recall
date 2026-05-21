import { CommandSearch } from "@/components/CommandSearch";
import { Avatar } from "@/components/ui";

export function TopBar({ userName }: { userName: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-bg/80 px-8 py-3 backdrop-blur">
      <CommandSearch />
      <div className="flex items-center gap-3">
        <button className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:bg-surface-2 hover:text-white" aria-label="Notifications">
          ◔
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
          <Avatar name={userName} size={26} />
          <span className="text-sm text-white">{userName}</span>
        </div>
      </div>
    </header>
  );
}
