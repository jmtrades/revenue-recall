"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureVisit, ensurePixels, flushServerPixel, trackInBrowser, type AdsPublicConfig } from "@/components/ads/browser";

const VIEWED = "rr_ads_viewed";

export function AdsRuntime(props: AdsPublicConfig) {
  const pathname = usePathname() || "/";

  useEffect(() => {
    window.__rrAds = props;
    captureVisit();
    ensurePixels();
    flushServerPixel();
    void trackInBrowser("PageView");
    const content = pathname === "/" || pathname === "/pricing" || pathname === "/signup" || pathname.startsWith("/industries");
    if (content) {
      const key = `${VIEWED}:${pathname}`;
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          void trackInBrowser("ViewContent");
        }
      } catch {
        void trackInBrowser("ViewContent");
      }
    }
    const onConsent = () => {
      ensurePixels();
      flushServerPixel();
    };
    window.addEventListener("rr-ads-consent", onConsent);
    return () => window.removeEventListener("rr-ads-consent", onConsent);
    // Config is static for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
