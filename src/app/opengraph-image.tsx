import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Revenue Recall — recover the revenue you're about to lose";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Bullet({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, background: "#5b8cff" }} />
      <span style={{ display: "flex" }}>{label}</span>
    </div>
  );
}

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
          backgroundImage: "linear-gradient(135deg, #0b0e14 0%, #121722 55%, #1a2440 100%)",
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
          <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 600 }}>
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
              letterSpacing: 2,
            }}
          >
            THE UNIVERSAL SALES OS
          </div>
          <div
            style={{
              display: "flex",
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
              maxWidth: 920,
            }}
          >
            Ranks every deal slipping away, drafts the outreach in your voice, and
            closes the loop. Any CRM, or none.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 40, color: "#8a93a6", fontSize: 24 }}>
          <Bullet label="Revenue Recall engine" />
          <Bullet label="Autopilot" />
          <Bullet label="Every industry" />
        </div>
      </div>
    ),
    { ...size },
  );
}
