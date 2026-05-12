/**
 * useSpectrum - Real-time FFT spectrum data from Web Audio API
 *
 * Creates an AnalyserNode connected to the AudioStreamClient's AudioContext.
 * Owns the analyser lifecycle. Callers read frequency data in their own render loop.
 *
 * NOTE: Requires AudioStreamClient to expose its AudioContext.
 * Currently connects via the audioClientRef passed from useAudioPlayback.
 * Phase D: uses AudioStreamClient.connect(existingAudioCtx) pattern
 * to share the AudioContext.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { AudioStreamClient } from '@neko/neko-client';

const FFT_SIZE = 256; // 128 frequency bins
const SMOOTHING = 0.8;

export function useSpectrum(
  audioClientRef: React.RefObject<AudioStreamClient | null>,
  enabled: boolean,
) {
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Setup analyser when enabled and audio client is available
  const setupAnalyser = useCallback(() => {
    if (!enabled) return;

    const audioClient = audioClientRef.current;
    if (!audioClient) return;

    // Get AudioContext and GainNode via public API
    try {
      const audioCtx = audioClient.getAudioContext();
      const gainNode = audioClient.getGainNode();

      if (!audioCtx || !gainNode) return;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING;

      // Connect gain → analyser (analyser doesn't affect output)
      gainNode.connect(analyser);

      analyserRef.current = analyser;
    } catch {
      // AudioStreamClient may not be connected yet
    }
  }, [audioClientRef, enabled]);

  useEffect(() => {
    if (enabled) {
      setupAnalyser();
    }

    return () => {
      // Disconnect analyser
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          // May already be disconnected
        }
        analyserRef.current = null;
      }
    };
  }, [enabled, setupAnalyser]);

  return { analyserRef, binCount: FFT_SIZE / 2 };
}
