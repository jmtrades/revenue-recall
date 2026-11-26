import { enroll } from "@/lib/cadence";
import { resolveProvider } from "@/lib/crm/registry";
import { captureLead } from "@/lib/leads-capture";
import { blockedEmail, OFFERS } from "@/lib/offers/catalog";

/** Put a missed build call on the rebook sequence. Never messages a blocked inbox. */
export async function enrollNoShowRecovery(input: { email?: string; phone?: string; name?: string; contactId?: string }): Promise<string | null> {
  if (blockedEmail(input.email)) return null;
  let contactId = input.contactId;
  if (!contactId && input.email) {
    const provider = await resolveProvider();
    const wanted = input.email.toLowerCase();
    const found = (await provider.listContacts()).find((c) => c.points.some((p) => p.channel === "email" && p.value.toLowerCase() === wanted));
    contactId = found?.id;
    if (!contactId) {
      const captured = await captureLead({
        name: input.name || input.email,
        email: input.email,
        phone: input.phone,
        source: OFFERS["build-call"].source,
        notes: "Missed the build call.",
        dealTitle: `${input.name || input.email} — rebook`,
      });
      contactId = captured.contactId;
    }
  }
  if (!contactId) return null;
  await enroll("no_show_rebook", `contact:${contactId}`);
  return contactId;
}
