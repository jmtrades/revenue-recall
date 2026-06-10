import { ImageResponse } from "next/og";

// Branded iOS home-screen icon. Without an apple-touch-icon, "Add to Home
// Screen" falls back to a page screenshot; the manifest's SVG only covers
// Android. 180×180 is the modern apple-touch-icon size; iOS masks the corners,
// so we fill the whole square with the brand green and centre the "RR" mark to
// match the nav logo and OG card.
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
          color: "#fff",
          fontSize: 88,
          fontWeight: 700,
          letterSpacing: -3,
          fontFamily: "sans-serif",
        }}
      >
        RR
      </div>
    ),
    size,
  );
}
