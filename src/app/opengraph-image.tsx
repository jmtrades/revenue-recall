import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Revenue Recall — recover the revenue you're about to lose";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(1000px 500px at 78% -10%, rgba(91,140,255,0.28), transparent), #0b0e14",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#5b8cff",
              color: "#fff",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            RR
          </div>
          <div style={{ color: "#fff", fontSize: 30, fontWeight: 600 }}>
            Revenue Recall
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              color: "#9cc0ff",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            The universal sales OS
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              color: "#fff",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            Recover the revenue you&apos;re about to lose.
          </div>
          <div
            style={{
              display: "flex",
              color: "#8a93a6",
              fontSize: 30,
              lineHeight: 1.35,
              maxWidth: 900,
            }}
          >
            Finds the deals going cold in any CRM — or none — drafts the outreach
            with AI, and closes the loop.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28, color: "#8a93a6", fontSize: 24 }}>
          <span style={{ display: "flex" }}>↺ Revenue Recall engine</span>
          <span style={{ display: "flex" }}>⚡ Autopilot</span>
          <span style={{ display: "flex" }}>◎ Every industry</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
