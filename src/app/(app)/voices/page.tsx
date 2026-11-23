import { PageHeader } from "@/components/ui";
import { VoiceLibrary } from "@/components/VoiceLibrary";
import { VoiceAssignments } from "@/components/VoiceAssignments";
import { elevenConfigured } from "@/lib/voice/eleven";

export const metadata = { title: "Voices" };
export const dynamic = "force-dynamic";

export default function VoicesPage() {
  const ready = elevenConfigured();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Voices"
        subtitle="Pick a voice for the workspace, a sequence, or a webinar. Clone one when the speaker has agreed."
      />
      {!ready && (
        <p className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-body">
          ElevenLabs is not connected. Add <span className="font-medium text-fg">ELEVENLABS_API_KEY</span> on the host and restart. Until then you can look around, but previews, cloning, and live calls stay off.
        </p>
      )}
      <VoiceLibrary />
      <VoiceAssignments />
    </div>
  );
}
