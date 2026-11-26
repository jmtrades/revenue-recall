import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AdsRuntime } from "@/components/ads/AdsRuntime";
import { WebChat } from "@/components/WebChat";
import { CookieConsent } from "@/components/CookieConsent";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
import { HelpWidget } from "@/components/HelpWidget";
import { SITE_URL } from "@/lib/site";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Display face stays Fraunces — the editorial serif — while the UI and the
// numerals move to Geist, the same family Vercel ships. Tables stay tabular.
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", style: ["normal", "italic"], axes: ["opsz"] });
const data = Geist_Mono({ subsets: ["latin"], variable: "--font-data", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Revenue Recall — Webinar drop-off recovery for coaches and consultants",
    template: "%s · Revenue Recall",
  },
  description: "Webinar drop-off recovery and an omnichannel AI sales team for high-ticket coaches, consultants, and course creators.",
};

export const viewport: Viewport = {
  themeColor: "#070807",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${data.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <AdsRuntime
          metaPixelId={process.env.META_PIXEL_ID ?? ""}
          ga4Id={process.env.GA4_ID ?? ""}
          googleAdsId={process.env.GOOGLE_ADS_ID ?? ""}
          labels={{
            Lead: process.env.GOOGLE_ADS_LABEL_LEAD ?? "",
            Contact: process.env.GOOGLE_ADS_LABEL_CONTACT ?? "",
            Schedule: process.env.GOOGLE_ADS_LABEL_SCHEDULE ?? "",
            Purchase: process.env.GOOGLE_ADS_LABEL_PURCHASE ?? "",
          }}
        />
        <WebChat />
        <HelpWidget />
        <CookieConsent />
        <ClientErrorReporter />
      </body>
    </html>
  );
}
