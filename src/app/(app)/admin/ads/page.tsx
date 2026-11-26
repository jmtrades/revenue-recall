import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader, Stat, Card } from "@/components/ui";
import { AdsTools } from "@/components/ads/AdsTools";
import { adsConfig } from "@/lib/ads/forward";
import { adsReport, rangeBounds } from "@/lib/ads/rollup";
import { listAds } from "@/lib/ads/store";
import { hydrateRemoteStore } from "@/lib/free/db";
import { getSessionRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";

export const metadata = { title: "Ads — Revenue Recall" };
export const dynamic = "force-dynamic";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function money(value: number | null, currency: string): string {
  if (value == null) return "—";
  if (currency === "USD") return usd.format(value);
  return `${currency} ${value.toFixed(2)}`;
}

export default async function AdsAdminPage(props: { searchParams: Promise<{ range?: string }> }) {
  const role = await getSessionRole();
  if (isAuthRequired() && role !== "owner" && role !== "admin") redirect("/dashboard");

  await hydrateRemoteStore().catch(() => undefined);
  const range = (await props.searchParams).range || "30";
  const bounds = rangeBounds(range === "7" || range === "90" || range === "all" ? range : "30");
  const { events, spend } = listAds();
  const report = adsReport(events, spend, bounds.from, bounds.to);
  const cfg = adsConfig();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://revenue-recall-relaunch.onrender.com";

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Ad costs"
        subtitle="Leads, booked calls, and sales from Meta, Google, and YouTube. Spend is what you enter. Ratios stay blank until both sides have numbers."
        action={
          <div className="flex gap-2 text-sm">
            {[
              ["7", "7 days"],
              ["30", "30 days"],
              ["90", "90 days"],
              ["all", "All"],
            ].map(([id, label]) => (
              <Link key={id} href={id === "30" ? "/admin/ads" : `/admin/ads?range=${id}`} className={`rounded-full px-3 py-1 ${range === id ? "bg-brand-strong text-white" : "bg-surface-2 text-muted"}`}>
                {label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads" value={String(report.totals.leads)} hint="Form and signup" />
        <Stat label="Booked calls" value={String(report.totals.bookings)} />
        <Stat label="Sales" value={String(report.totals.sales)} hint={money(report.totals.revenue, report.totals.currency)} />
        <Stat label="Spend" value={money(report.totals.spend, report.totals.currency)} hint={report.totals.mixedCurrency ? "Mixed currencies — showing the first" : "Entered by you"} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cost per lead" value={money(report.totals.cpl, report.totals.currency)} />
        <Stat label="Cost per booked call" value={money(report.totals.costPerBooking, report.totals.currency)} />
        <Stat label="CAC" value={money(report.totals.cac, report.totals.currency)} hint="Spend ÷ sales" />
        <Stat label="ROAS" value={report.totals.roas == null ? "—" : `${report.totals.roas.toFixed(2)}×`} hint="Revenue ÷ spend" />
      </div>

      <Card className="mt-6" title="By campaign">
        <SliceTable rows={report.byCampaign} currency={report.totals.currency} />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By source">
          <SliceTable rows={report.bySource} currency={report.totals.currency} />
        </Card>
        <Card title="By ad">
          <SliceTable rows={report.byAd} currency={report.totals.currency} />
        </Card>
      </div>

      <p className="mt-6 text-sm text-muted">
        Pixel {cfg.metaPixelId ? "set" : "not set"} · Conversions API {cfg.metaToken ? "set" : "not set"} · GA4 {cfg.ga4Id && cfg.ga4Secret ? "set" : "not set"} · Google Ads {cfg.googleAdsId ? "set" : "not set"} · Test code {cfg.metaTestCode ? "set" : "not set"}.
        Tags stay off until those values exist. UK and EU visitors get the cookie banner first.
      </p>
      <AdsTools origin={origin} />
      <p className="mt-6 text-sm">
        <Link href="/admin" className="text-brand hover:underline">Back to admin</Link>
      </p>
    </div>
  );
}

function SliceTable({ rows, currency }: { rows: { key: string; leads: number; bookings: number; sales: number; revenue: number; spend: number }[]; currency: string }) {
  if (!rows.length) return <p className="text-sm text-muted">Nothing in this range yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Leads</th>
            <th className="py-2 pr-3 font-medium">Booked</th>
            <th className="py-2 pr-3 font-medium">Sales</th>
            <th className="py-2 font-medium">Spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <td className="py-2 pr-3 text-fg">{row.key}</td>
              <td className="py-2 pr-3 tabular-nums">{row.leads}</td>
              <td className="py-2 pr-3 tabular-nums">{row.bookings}</td>
              <td className="py-2 pr-3 tabular-nums">{row.sales}</td>
              <td className="py-2 tabular-nums">{row.spend ? money(row.spend, currency) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
