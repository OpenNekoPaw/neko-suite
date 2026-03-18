/**
 * useSpectrum - Real-time FFT spectrum data from Web Audio API
 *
 * Creates an AnalyserNode connected to the AudioStreamClient's AudioContext.
 * Provides frequency data array updated via requestAnimationFrame.
 *
 * NOTE: Requires AudioStreamClient to expose its AudioContext.
 * Currently connects via the audioClientRef passed from useAudioPlayback.
 * Phase D: uses AudioStreamClient.connect(existingAudioCtx) pattern
 * to share the AudioContext.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { AudioStreamClient } from '@neko/neko-client';

const FFT_SIZE = 256; // 128 frequency bins
const SMOOTHING = 0.8;

export function useSpectrum(
  audioClientRef: React.RefObject<AudioStreamClient | null>,
  enabled: boolean,
) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animFrameRef = useRef(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);

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
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // AudioStreamClient may not be connected yet
    }
  }, [audioClientRef, enabled]);

  // Animation loop for frequency data
  const updateSpectrum = useCallback(() => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      // Create a new Uint8Array to trigger React re-render
      setFrequencyData(new Uint8Array(dataArray.buffer.slice(0)));
    }

    if (enabled) {
      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      setupAnalyser();
      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
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
  }, [enabled, setupAnalyser, updateSpectrum]);

  return { frequencyData, binCount: FFT_SIZE / 2 };
}
