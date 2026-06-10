import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org";
import { defaultAvailability } from "@/lib/meetings/availability";
import type { Availability, Booking, DayWindow, MeetingLocationKind, MeetingType, WeeklyWindows } from "@/lib/meetings/types";

/**
 * Org-scoped persistence for native meetings: meeting types, the weekly
 * availability schedule, and confirmed bookings. Reads degrade gracefully (empty
 * / sensible defaults without a DB or before the migration lands) so the booking
 * surfaces keep rendering; writes require a database. Service-role client +
 * explicit org_id scoping, resolved from the request (session or runWithOrg
 * override) — so the public, session-less booking path is correctly tenanted.
 */

interface MeetingTypeRow {
  id: string;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  location_kind: string;
  location_detail: string | null;
  enabled: boolean;
}

const LOCATION_KINDS: MeetingLocationKind[] = ["phone", "video", "in_person", "custom"];

function toMeetingType(r: MeetingTypeRow): MeetingType {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    durationMinutes: r.duration_minutes,
    description: r.description ?? undefined,
    locationKind: (LOCATION_KINDS.includes(r.location_kind as MeetingLocationKind) ? r.location_kind : "phone") as MeetingLocationKind,
    locationDetail: r.location_detail ?? undefined,
    enabled: r.enabled,
  };
}

const MT_COLS = "id,name,slug,duration_minutes,description,location_kind,location_detail,enabled";

/** The org's meeting types (oldest first). Never throws. */
export async function listMeetingTypes(opts?: { enabledOnly?: boolean }): Promise<MeetingType[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  let q = client.from("meeting_types").select(MT_COLS).eq("org_id", orgId).order("created_at", { ascending: true });
  if (opts?.enabledOnly) q = q.eq("enabled", true);
  const { data, error } = await q;
  if (error) return [];
  return ((data as MeetingTypeRow[] | null) ?? []).map(toMeetingType);
}

/** A single enabled meeting type by slug, or null. Never throws. */
export async function getMeetingTypeBySlug(slug: string): Promise<MeetingType | null> {
  const client = getSupabase();
  if (!client) return null;
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return null;
  const { data, error } = await client.from("meeting_types").select(MT_COLS).eq("org_id", orgId).eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return toMeetingType(data as MeetingTypeRow);
}

export interface MeetingTypeInput {
  name: string;
  slug: string;
  durationMinutes: number;
  description?: string;
  locationKind: MeetingLocationKind;
  locationDetail?: string;
  enabled?: boolean;
}

async function ctx() {
  const client = getSupabase();
  if (!client) throw new Error("Scheduling requires a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const user = await getSessionUser().catch(() => null);
  return { client, orgId, userId: user?.id ?? null };
}

export async function createMeetingType(input: MeetingTypeInput): Promise<MeetingType> {
  const { client, orgId, userId } = await ctx();
  const { data, error } = await client
    .from("meeting_types")
    .insert({
      org_id: orgId,
      name: input.name,
      slug: input.slug,
      duration_minutes: input.durationMinutes,
      description: input.description || null,
      location_kind: input.locationKind,
      location_detail: input.locationDetail || null,
      enabled: input.enabled ?? true,
      created_by: userId,
    })
    .select(MT_COLS)
    .single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "A meeting type with that link already exists." : error.message);
  return toMeetingType(data as MeetingTypeRow);
}

export async function updateMeetingType(id: string, patch: Partial<MeetingTypeInput>): Promise<void> {
  const { client, orgId } = await ctx();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes;
  if (patch.description !== undefined) update.description = patch.description || null;
  if (patch.locationKind !== undefined) update.location_kind = patch.locationKind;
  if (patch.locationDetail !== undefined) update.location_detail = patch.locationDetail || null;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  const { error } = await client.from("meeting_types").update(update).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "A meeting type with that link already exists." : error.message);
}

export async function deleteMeetingType(id: string): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("meeting_types").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

interface AvailabilityRow {
  timezone: string | null;
  weekly: unknown;
  slot_minutes: number;
  min_notice_minutes: number;
  horizon_days: number;
}

/** Coerce stored JSONB into a clean WeeklyWindows (drops anything malformed). */
function toWeekly(raw: unknown): WeeklyWindows {
  if (!raw || typeof raw !== "object") return {};
  const out: WeeklyWindows = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !Array.isArray(v)) continue;
    const windows: DayWindow[] = [];
    for (const w of v) {
      if (w && typeof w === "object" && typeof (w as DayWindow).start === "string" && typeof (w as DayWindow).end === "string") {
        windows.push({ start: (w as DayWindow).start, end: (w as DayWindow).end });
      }
    }
    if (windows.length) out[day] = windows;
  }
  return out;
}

/** The org's availability schedule, or a weekdays-9–5 default in the org's
 *  timezone when none is configured. Never throws. */
export async function getAvailability(): Promise<Availability> {
  const org = await getOrgSettings().catch(() => null);
  const tz = org?.timezone ?? "";
  const client = getSupabase();
  if (!client) return defaultAvailability(tz);
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return defaultAvailability(tz);
  const { data, error } = await client
    .from("booking_availability")
    .select("timezone,weekly,slot_minutes,min_notice_minutes,horizon_days")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) return defaultAvailability(tz);
  const row = data as AvailabilityRow;
  const weekly = toWeekly(row.weekly);
  // An empty/never-configured schedule falls back to the sensible default so the
  // booking page is usable out of the box.
  if (Object.keys(weekly).length === 0) return defaultAvailability(row.timezone || tz);
  return {
    timezone: row.timezone || tz,
    weekly,
    slotMinutes: row.slot_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    horizonDays: row.horizon_days,
  };
}

export async function saveAvailability(avail: Availability): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("booking_availability").upsert(
    {
      org_id: orgId,
      timezone: avail.timezone || "",
      weekly: avail.weekly,
      slot_minutes: avail.slotMinutes,
      min_notice_minutes: avail.minNoticeMinutes,
      horizon_days: avail.horizonDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );
  if (error) throw new Error(error.message);
}

interface BookingRow {
  id: string;
  meeting_type_id: string | null;
  meeting_name: string;
  duration_minutes: number;
  contact_id: string | null;
  deal_id: string | null;
  invitee_name: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    meetingTypeId: r.meeting_type_id,
    meetingName: r.meeting_name,
    durationMinutes: r.duration_minutes,
    contactId: r.contact_id,
    dealId: r.deal_id,
    inviteeName: r.invitee_name,
    inviteeEmail: r.invitee_email ?? undefined,
    inviteePhone: r.invitee_phone ?? undefined,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    timezone: r.timezone ?? "",
    status: r.status === "cancelled" ? "cancelled" : "confirmed",
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

const BK_COLS =
  "id,meeting_type_id,meeting_name,duration_minutes,contact_id,deal_id,invitee_name,invitee_email,invitee_phone,starts_at,ends_at,timezone,status,notes,created_at";

/** Confirmed bookings whose start falls in [fromIso, toIso), for conflict checks.
 *  Never throws (a read failure → no known conflicts, the slot stays offered). */
export async function busyIntervals(fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  const { data, error } = await client
    .from("bookings")
    .select("starts_at,ends_at")
    .eq("org_id", orgId)
    .eq("status", "confirmed")
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso);
  if (error) return [];
  return ((data as { starts_at: string; ends_at: string }[] | null) ?? []).map((r) => ({ start: r.starts_at, end: r.ends_at }));
}

/** The org's bookings (soonest upcoming first by default). Never throws. */
export async function listBookings(opts?: { upcomingOnly?: boolean; limit?: number }): Promise<Booking[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  let q = client.from("bookings").select(BK_COLS).eq("org_id", orgId).order("starts_at", { ascending: true });
  if (opts?.upcomingOnly) q = q.gte("starts_at", new Date().toISOString()).eq("status", "confirmed");
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) return [];
  return ((data as BookingRow[] | null) ?? []).map(toBooking);
}

export interface NewBookingRow {
  meetingTypeId: string | null;
  meetingName: string;
  durationMinutes: number;
  contactId: string | null;
  dealId: string | null;
  inviteeName: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  notes?: string;
}

export async function insertBooking(row: NewBookingRow): Promise<Booking> {
  const { client, orgId } = await ctx();
  const { data, error } = await client
    .from("bookings")
    .insert({
      org_id: orgId,
      meeting_type_id: row.meetingTypeId,
      meeting_name: row.meetingName,
      duration_minutes: row.durationMinutes,
      contact_id: row.contactId,
      deal_id: row.dealId,
      invitee_name: row.inviteeName,
      invitee_email: row.inviteeEmail || null,
      invitee_phone: row.inviteePhone || null,
      starts_at: row.startsAt,
      ends_at: row.endsAt,
      timezone: row.timezone || "",
      status: "confirmed",
      notes: row.notes || null,
    })
    .select(BK_COLS)
    .single();
  if (error) throw new Error(error.message);
  return toBooking(data as BookingRow);
}
