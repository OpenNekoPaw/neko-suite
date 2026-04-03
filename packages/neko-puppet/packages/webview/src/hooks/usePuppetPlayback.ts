/**
 * usePuppetPlayback — orchestrates animation playback with WebSocket streaming
 *
 * Manages the lifecycle: play → connect WS stream → receive deltas → update store.
 * HTTP is used for discrete commands (play/stop/seek); WS for continuous mesh updates.
 * Prevents double-tick by never calling HTTP tick() while the stream is active.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { IInochi2DController } from '../animation';
import { usePuppetStore } from '../stores/puppet-store';

export interface PuppetPlaybackCallbacks {
  onPlay: (name: string, loop: boolean) => void;
  onStop: () => void;
  onSeek: (timeMs: number) => void;
  onCrossfade: (name: string, fadeDurationMs: number, loop: boolean) => void;
}

/**
 * Hook that wires up animation playback to the WebSocket preview stream.
 * Returns callbacks for AnimationPanel props.
 */
export function usePuppetPlayback(controller: IInochi2DController | null): PuppetPlaybackCallbacks {
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.stopPreviewStream();
    };
  }, []);

  const onPlay = useCallback((name: string, loop: boolean) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const store = usePuppetStore.getState();

    // 1. Send play command via HTTP
    void ctrl.playAnimation(name, loop);

    // 2. Update store state
    store.setCurrentAnimation(name);
    store.setPlayState('playing');
    store.setAnimationTimeMs(0);

    // 3. Connect preview stream for continuous mesh updates
    ctrl.startPreviewStream(
      (delta) => {
        const s = usePuppetStore.getState();
        s.setDeformedMeshes(delta.deformed_meshes);

        // Sync animation progress from stream
        if (delta.animation_time_ms != null) {
          s.setAnimationTimeMs(delta.animation_time_ms);
        }

        // Auto-stop when animation finishes (non-looping)
        if (delta.animation_playing === false) {
          s.setPlayState('idle');
          ctrl.stopPreviewStream();
          s.setStreamConnected(false);
        }
      },
      (connected) => {
        usePuppetStore.getState().setStreamConnected(connected);
      },
    );
  }, []);

  const onStop = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const store = usePuppetStore.getState();

    // 1. Send stop command via HTTP
    void ctrl.stopAnimation();

    // 2. Disconnect stream
    ctrl.stopPreviewStream();

    // 3. Update store
    store.setPlayState('idle');
    store.setStreamConnected(false);
  }, []);

  const onSeek = useCallback((timeMs: number) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    // Seek via HTTP — the stream's next tick will reflect the new position
    void ctrl.seekAnimation(timeMs);
  }, []);

  const onCrossfade = useCallback((name: string, fadeDurationMs: number, loop: boolean) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const store = usePuppetStore.getState();

    // 1. Send crossfade command via HTTP
    void ctrl.crossfadeTo(name, fadeDurationMs, loop);

    // 2. Update store state
    store.setCurrentAnimation(name);
    store.setPlayState('playing');

    // 3. Ensure preview stream is connected for continuous mesh updates
    if (!ctrl.isStreaming()) {
      ctrl.startPreviewStream(
        (delta) => {
          const s = usePuppetStore.getState();
          s.setDeformedMeshes(delta.deformed_meshes);

          if (delta.animation_time_ms != null) {
            s.setAnimationTimeMs(delta.animation_time_ms);
          }

          if (delta.animation_playing === false) {
            s.setPlayState('idle');
            ctrl.stopPreviewStream();
            s.setStreamConnected(false);
          }
        },
        (connected) => {
          usePuppetStore.getState().setStreamConnected(connected);
        },
      );
    }
  }, []);

  return { onPlay, onStop, onSeek, onCrossfade };
}
