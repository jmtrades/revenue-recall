import { offerFromHint, type OfferId } from "@/lib/offers/catalog";

export interface LeadgenFields {
  name: string;
  email: string;
  phone: string;
  business: string;
  monthlyRevenue?: number;
  offer: OfferId;
}

function dict(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Meta instant-form field_data, when the webhook includes it. */
export function mapLeadgen(raw: unknown): LeadgenFields | null {
  const root = dict(raw);
  if (!root) return null;
  const fields = Array.isArray(root.field_data) ? root.field_data : [];
  const bag: Record<string, string> = {};
  for (const field of fields) {
    const row = dict(field);
    if (!row) continue;
    const key = String(row.name ?? "").toLowerCase();
    const values = Array.isArray(row.values) ? row.values : [];
    const value = values.map((v) => String(v ?? "").trim()).find(Boolean) ?? "";
    if (key && value) bag[key] = value;
  }
  const email = bag.email || bag.email_address || "";
  const phone = bag.phone_number || bag.phone || "";
  const name = bag.full_name || bag.name || [bag.first_name, bag.last_name].filter(Boolean).join(" ");
  if (!name && !email && !phone) return null;
  const revenue = Number(bag.monthly_revenue || bag.revenue || "");
  const hint = bag.offer || bag.form_name || String(root.form_name ?? root.ad_name ?? "");
  return {
    name: name || "Meta lead",
    email,
    phone,
    business: bag.company_name || bag.business || bag.company || "",
    monthlyRevenue: Number.isFinite(revenue) && revenue > 0 ? revenue : undefined,
    offer: offerFromHint(hint),
  };
}
