import { beaconScript } from "@/lib/webinar/presence";

export const dynamic = "force-dynamic";

/** Script tag an org embeds on a page they control. Configure window.RR_WEBINAR first. */
export function GET() {
  return new Response(beaconScript(), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
