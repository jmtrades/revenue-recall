"use client";

import { useEffect } from "react";
import { enableNeuralVoice } from "@/lib/voice/neural";

/**
 * Registers the in-house neural voice backend on mount. No-op visually. If
 * NEXT_PUBLIC_NEURAL_VOICE_URL is unset the backend reports available() ===
 * false and every voice surface transparently uses the browser engine — so
 * mounting this always is safe and changes nothing until the service is live.
 */
export function NeuralVoice() {
  useEffect(() => {
    enableNeuralVoice();
  }, []);
  return null;
}
