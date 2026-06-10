import { ImageResponse } from "next/og";
import { PLANS } from "@/components/marketing/pricing-data";

// Share card for /pricing — a pricing link shared in Slack/LinkedIn/X shows
// the actual numbers instead of the generic brand card. Prices come from the
// SAME array that renders the page, so the card can never drift from reality.
// Satori-safe: solid + linear-gradient only, explicit display:flex everywhere.
export const alt = "Revenue Recall pricing — an autonomous AI sales force from $0";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function PricingOgImage() {
  const cards = PLANS.filter((p) => p.monthly !== null).map((p) => ({
    name: p.name,
    price: `$${p.monthly}`,
    unit: p.monthly === 0 ? "free forever" : p.unit.replace(/^\//, "per "),
    featured: p.featured,
  }));

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
          <div style={{ display: "flex", color: "#fff", fontSize: 62, fontWeight: 700, lineHeight: 1.08 }}>
            Simple pricing.
          </div>
          <div style={{ display: "flex", color: "#34d399", fontSize: 62, fontWeight: 700, lineHeight: 1.08 }}>
            An AI sales force from $0.
          </div>
        </div>

        {/* plan price chips — the real numbers */}
        <div style={{ display: "flex", gap: 18 }}>
          {cards.map((c) => (
            <div
              key={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "20px 26px",
                borderRadius: 18,
                border: c.featured ? "2px solid #059669" : "1px solid #262a27",
                background: c.featured ? "linear-gradient(180deg, #0e1f18 0%, #0c1512 100%)" : "#101411",
              }}
            >
              <div style={{ display: "flex", color: "#9ca39c", fontSize: 20, fontWeight: 600 }}>{c.name}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div style={{ display: "flex", color: "#fff", fontSize: 44, fontWeight: 700 }}>{c.price}</div>
                <div style={{ display: "flex", color: "#6f766f", fontSize: 19, paddingBottom: 6 }}>{c.unit}</div>
              </div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px 26px",
              borderRadius: 18,
              border: "1px solid #262a27",
              color: "#dfe3df",
              fontSize: 22,
            }}
          >
            No contracts · cancel anytime
          </div>
        </div>
      </div>
    ),
    size,
  );
}
