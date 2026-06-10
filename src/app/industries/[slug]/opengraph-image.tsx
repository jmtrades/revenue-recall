import { ImageResponse } from "next/og";
import { INDUSTRIES } from "@/lib/industries";

// Per-industry social-share card (Open Graph + Twitter) — shown when an
// industry SEO page is shared anywhere, instead of the generic root card. Same
// satori-safe rules as the root image: solid + linear-gradient layers only (no
// radial-gradient), explicit display:flex on every container.
export const alt = "Revenue Recall — autonomous outbound tuned to your industry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const slugFor = (id: string) => id.replace(/_/g, "-");
const LISTED = INDUSTRIES.filter((i) => i.id !== "generic");

// Pre-render a card per industry alongside the static pages.
export function generateStaticParams() {
  return LISTED.map((i) => ({ slug: slugFor(i.id) }));
}

export default function Image({ params }: { params: { slug: string } }) {
  const ind = LISTED.find((i) => slugFor(i.id) === params.slug);
  const label = ind?.label ?? "every industry";
  const blurb = ind?.blurb ?? "Autonomous outbound that works every deal across email, SMS, and the phone.";

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
          <div style={{ display: "flex", color: "#fff", fontSize: 60, fontWeight: 700, lineHeight: 1.08 }}>
            Autonomous outbound
          </div>
          <div style={{ display: "flex", color: "#34d399", fontSize: 60, fontWeight: 700, lineHeight: 1.08 }}>
            for {label}.
          </div>
          <div style={{ display: "flex", color: "#9ca39c", fontSize: 27, lineHeight: 1.4, marginTop: 24, maxWidth: 980 }}>
            {blurb}
          </div>
        </div>

        {/* footer chips */}
        <div style={{ display: "flex", gap: 14 }}>
          {["Works every slipping deal", "Email · SMS · phone", "Any CRM, or none"].map((t) => (
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
