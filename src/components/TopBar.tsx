import { CommandSearch } from "@/components/CommandSearch";
import { QuickCreate } from "@/components/QuickCreate";
import { Notifications } from "@/components/Notifications";
import { MobileMenu } from "@/components/MobileMenu";
import { UserMenu } from "@/components/UserMenu";

export function TopBar({ userName, userEmail, signedIn, orgName }: { userName: string; userEmail?: string; signedIn: boolean; orgName: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileMenu orgName={orgName} />
        <CommandSearch />
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <QuickCreate />
        <Notifications />
        <UserMenu name={userName} email={userEmail} signedIn={signedIn} />
      </div>
    </header>
  );
}
