/**
 * useFramePlayback — requestAnimationFrame loop for frame-by-frame animation
 *
 * Advances currentFrameIndex at the configured FPS rate.
 * Supports loop playback and auto-stop at end of timeline.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSketchStore } from '../stores';

interface FramePlaybackOptions {
  loop?: boolean;
}

export function useFramePlayback(options: FramePlaybackOptions = {}) {
  const { loop = true } = options;
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  const play = useCallback(() => {
    useSketchStore.getState().setFramePlaying(true);
  }, []);

  const stop = useCallback(() => {
    useSketchStore.getState().setFramePlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const toggle = useCallback(() => {
    const { isFramePlaying } = useSketchStore.getState();
    if (isFramePlaying) {
      stop();
    } else {
      play();
    }
  }, [play, stop]);

  // Animation loop driven by store state
  const isPlaying = useSketchStore((s) => s.isFramePlaying);
  const fps = useSketchStore((s) => s.fps);

  useEffect(() => {
    if (!isPlaying) return;

    const frameDurationMs = 1000 / fps;
    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current;

      if (elapsed >= frameDurationMs) {
        lastTickRef.current = now - (elapsed % frameDurationMs);

        const state = useSketchStore.getState();
        const layer = state.frameLayers.find((l) => l.id === state.selectedFrameLayerId);
        if (!layer) {
          stop();
          return;
        }

        const maxIndex = layer.frames.length - 1;
        if (state.currentFrameIndex >= maxIndex) {
          if (loop) {
            state.setCurrentFrameIndex(0);
          } else {
            stop();
            return;
          }
        } else {
          state.nextFrame();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, fps, loop, stop]);

  return { play, stop, toggle, isPlaying };
}
