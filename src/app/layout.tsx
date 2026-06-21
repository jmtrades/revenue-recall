import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
import { HelpWidget } from "@/components/HelpWidget";
import { SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Revenue Recall — Autonomous outbound that runs your whole sales operation",
    template: "%s · Revenue Recall",
  },
  description: "An autonomous AI sales force that recovers the revenue you're losing — works every deal across email, SMS, and the phone, for any industry, with any CRM or none.",
};

export const viewport: Viewport = {
  themeColor: "#0a0b0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <HelpWidget />
        <CookieConsent />
        <ClientErrorReporter />
      </body>
    </html>
  );
}
