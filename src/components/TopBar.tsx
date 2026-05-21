import { CommandSearch } from "@/components/CommandSearch";
import { QuickCreate } from "@/components/QuickCreate";
import { Notifications } from "@/components/Notifications";
import { MobileMenu } from "@/components/MobileMenu";
import { Avatar } from "@/components/ui";

export function TopBar({ userName, orgName }: { userName: string; orgName: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3">
        <MobileMenu orgName={orgName} />
        <CommandSearch />
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <QuickCreate />
        <Notifications />
        <div className="hidden items-center gap-2 rounded-lg border border-border px-2 py-1 sm:flex">
          <Avatar name={userName} size={26} />
          <span className="text-sm text-white">{userName}</span>
        </div>
      </div>
    </header>
  );
}
