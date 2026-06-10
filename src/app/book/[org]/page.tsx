import type { Metadata } from "next";
import { verifyBookingToken } from "@/lib/meetings/token";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getOrgSettings } from "@/lib/org";
import { listMeetingTypes, getAvailability, busyIntervals } from "@/lib/meetings/store";
import { generateSlots } from "@/lib/meetings/availability";
import { DEFAULT_MEETING_TYPE, type MeetingType } from "@/lib/meetings/types";
import { BookingWidget } from "@/components/booking/BookingWidget";

export const dynamic = "force-dynamic";
// A public booking page embedded on customers' sites shouldn't be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: { org: string };
  searchParams: { k?: string; t?: string };
}

function locationLabel(t: MeetingType): string {
  if (t.locationDetail) return t.locationDetail;
  switch (t.locationKind) {
    case "video":
      return "Video call";
    case "in_person":
      return "In person";
    case "custom":
      return "Details to follow";
    default:
      return "Phone call";
  }
}

export default async function BookingPage({ params, searchParams }: Props) {
  const org = decodeURIComponent(params.org);
  const token = searchParams.k ?? "";
  const valid = verifyBookingToken(org, token);

  if (!valid) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="font-display text-lg font-semibold text-fg">Booking unavailable</h1>
          <p className="mt-2 text-sm text-muted">This booking link is invalid or has expired. Please contact whoever shared it.</p>
        </div>
      </Shell>
    );
  }

  const data = await runWithOrg(org, async () => {
    const [settings, types, avail] = await Promise.all([
      getOrgSettings().catch(() => null),
      listMeetingTypes({ enabledOnly: true }),
      getAvailability(),
    ]);
    const list = types.length > 0 ? types : [DEFAULT_MEETING_TYPE];
    const selected = list.find((t) => t.slug === searchParams.t) ?? list[0];
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + (Math.max(1, avail.horizonDays) + 1) * 86_400_000);
    const busy = await busyIntervals(now.toISOString(), horizonEnd.toISOString());
    const slots = generateSlots(avail, { durationMinutes: selected.durationMinutes, busy, now });
    return { brand: settings?.name || "us", list, selected, slots };
  });

  const others = data.list.filter((t) => t.slug !== data.selected.slug).map((t) => ({ slug: t.slug, name: t.name }));

  return (
    <Shell>
      <BookingWidget
        org={org}
        token={token}
        brand={data.brand}
        meeting={{
          slug: data.selected.slug,
          name: data.selected.name,
          durationMinutes: data.selected.durationMinutes,
          location: locationLabel(data.selected),
        }}
        others={others}
        slots={data.slots}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-lg">{children}</div>
    </main>
  );
}
