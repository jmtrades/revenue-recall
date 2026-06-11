import { ImageResponse } from "next/og";

// Branded iOS home-screen icon. Without an apple-touch-icon, "Add to Home
// Screen" falls back to a page screenshot; the manifest's SVG only covers
// Android. 180×180 is the modern apple-touch-icon size; iOS masks the corners,
// so we fill the whole square with the brand green and centre the recall-loop
// mark to match the nav logo and favicon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#059669",
        }}
      >
        {/* The recall-loop mark (components/Logo.tsx), white at icon scale. */}
        <svg viewBox="0 0 24 24" width={104} height={104} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5 9.2 9.2 0 0 0-6.4 2.6L3.5 8.2" />
          <path d="M3.5 3.5v4.7h4.7" />
          <circle cx="12" cy="12" r="2.5" fill="#ffffff" stroke="none" />
        </svg>
      </div>
    ),
    size,
  );
}
