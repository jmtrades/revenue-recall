"use client";

import { useEffect } from "react";
import { enableNeuralVoice } from "@/lib/voice/neural";

/**
 * Registers the ElevenLabs voice backend on mount and probes it once. No-op
 * visually. With no ElevenLabs key configured (or logged out / not entitled) the
 * backend reports available() === false and voice surfaces stay silent (voice is
 * ElevenLabs-only, no fallback) — so mounting this always is safe.
 */
export function NeuralVoice() {
  useEffect(() => {
    enableNeuralVoice();
  }, []);
  return null;
}
