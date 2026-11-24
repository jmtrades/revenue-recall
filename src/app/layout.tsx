import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
    default: "Revenue Recall — Autonomous outbound that runs your whole sales operation",
    template: "%s · Revenue Recall",
  },
  description: "An autonomous AI sales force that recovers the revenue you're losing — works every deal across email, SMS, and the phone, for any industry, with any CRM or none.",
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
        <HelpWidget />
        <CookieConsent />
        <ClientErrorReporter />
      </body>
    </html>
  );
}
