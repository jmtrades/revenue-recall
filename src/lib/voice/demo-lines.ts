import type { Emotion } from "@/lib/voice/speech";

/**
 * The fixed lines the public landing VoiceDemo plays. Defined here (not inline in
 * the component) so the server-side `/api/voice/preview` route can synthesize them
 * BY INDEX — the public, unauthenticated preview can therefore only ever generate
 * THESE lines through ElevenLabs, never arbitrary caller-supplied text, which
 * bounds the spend/abuse surface.
 *
 * Each is a real outbound line paired with the voice + delivery that fits it, so a
 * click sounds like a person on a call, not a TTS demo reading a paragraph.
 */
export const DEMO_LINES: { voiceId: string; name: string; tone: string; emotion: Emotion; text: string }[] = [
  {
    voiceId: "af_heart",
    name: "Aria",
    tone: "Warm · US",
    emotion: "warm",
    text: "Hey Jordan, it's Aria over at Northwind. That corner unit you'd looked at in the spring just came back on — and at a better number this time. Worth a quick look this weekend?",
  },
  {
    voiceId: "am_adam",
    name: "Adam",
    tone: "Steady · US",
    emotion: "confident",
    text: "Hi Sam, Adam here. I know rates were the holdup last time we spoke. They've moved since then, so I re-ran your numbers — I think you'll like where it lands. Have two minutes?",
  },
  {
    voiceId: "af_nova",
    name: "Nova",
    tone: "Confident · US",
    emotion: "energetic",
    text: "Morning! It's Nova following up on your quote. It expires Friday, but I can lock today's pricing for you right now if you're still interested. Want me to hold it?",
  },
  {
    voiceId: "bm_george",
    name: "George",
    tone: "British · UK",
    emotion: "calm",
    text: "Hello, it's George. We never did close the loop on your project — completely my fault for letting it go quiet. If the timing's better now, I'd love to pick it back up.",
  },
];
