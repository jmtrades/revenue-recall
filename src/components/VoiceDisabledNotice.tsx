import { Icon } from "@/components/icons";

/**
 * The "voice feature isn't connected, here's why + how" card, shown to people
 * who can fix it (owners/admins). One component so every voice surface — the
 * read-aloud library and the live agent — presents an unavailable state
 * identically; callers supply only the title, message, and an optional link.
 */
export function VoiceDisabledNotice({
  title,
  message,
  link,
}: {
  title: string;
  message: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5">
      <Icon name="volume" size={16} className="mt-0.5 flex-none text-warn" />
      <div>
        <p className="text-xs font-medium text-warn">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{message}</p>
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] font-medium text-brand hover:underline"
          >
            {link.label}
          </a>
        )}
      </div>
    </div>
  );
}
