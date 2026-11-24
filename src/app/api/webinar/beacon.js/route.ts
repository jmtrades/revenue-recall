import { beaconScript } from "@/lib/webinar/presence";

export const dynamic = "force-dynamic";

/** Script tag an org embeds on a page they control. The query token is the same secret shown in Settings. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const provider = url.searchParams.get("provider") || "beacon";
  const endpoint = token
    ? `${url.origin}/api/webinar/beacon?provider=${encodeURIComponent(provider)}&token=${encodeURIComponent(token)}`
    : "";
  return new Response(beaconScript({ endpoint, provider }), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
