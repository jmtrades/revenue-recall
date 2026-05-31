import { ImageResponse } from "next/og";

// Branded social-share card (Open Graph + Twitter). Shows when a Revenue Recall
// link is shared anywhere. Kept satori-safe: solid + linear-gradient layers
// only (no radial-gradient), explicit display:flex on every container.
export const alt = "Revenue Recall — autonomous outbound that runs your whole sales operation";
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
          padding: "72px",
          background: "linear-gradient(160deg, #0c1512 0%, #0a0b0a 55%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            RR
          </div>
          <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 600 }}>Revenue Recall</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#fff", fontSize: 66, fontWeight: 700, lineHeight: 1.08 }}>
            Put your entire sales operation
          </div>
          <div style={{ display: "flex", color: "#34d399", fontSize: 66, fontWeight: 700, lineHeight: 1.08 }}>
            on autopilot.
          </div>
          <div style={{ display: "flex", color: "#9ca39c", fontSize: 27, lineHeight: 1.4, marginTop: 24, maxWidth: 920 }}>
            An autonomous AI sales force — works every deal across email, SMS, and the phone. Any industry, any CRM, or none.
          </div>
        </div>

        {/* footer chips */}
        <div style={{ display: "flex", gap: 14 }}>
          {["Autonomous outbound", "Revenue Recall engine", "Any CRM, or none"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid #262a27",
                color: "#dfe3df",
                fontSize: 22,
              }}
            >
              <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: "#059669" }} />
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
