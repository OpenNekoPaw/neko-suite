/**
 * PuppetKeyframeTimeline — Adapter wrapping the shared KeyframeTimeline
 *
 * Connects puppet-store state (tracks, currentTimeMs, selectedKeyframeIds)
 * to the shared KeyframeTimeline component. Delegates CRUD operations
 * to the IInochi2DController for engine dispatch.
 */
import { useCallback, useEffect, useRef } from 'react';
import { KeyframeTimeline } from '@neko/shared/components';
import type { EasingType } from '@neko/shared';
import type { IInochi2DController } from '../animation';
import { usePuppetStore } from '../stores/puppet-store';

interface PuppetKeyframeTimelineProps {
  controller: IInochi2DController | null;
}

export function PuppetKeyframeTimeline({ controller }: PuppetKeyframeTimelineProps) {
  const tracks = usePuppetStore((s) => s.keyframeTracks);
  const currentTimeMs = usePuppetStore((s) => s.animationTimeMs);
  const selectedKeyframeIds = usePuppetStore((s) => s.selectedKeyframeIds);
  const currentAnimation = usePuppetStore((s) => s.currentAnimation);
  const animations = usePuppetStore((s) => s.animations);
  const setKeyframeTracks = usePuppetStore((s) => s.setKeyframeTracks);
  const setSelectedKeyframeIds = usePuppetStore((s) => s.setSelectedKeyframeIds);

  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  // Derive clip duration from current animation
  const currentClip = animations.find((c) => c.name === currentAnimation);
  const durationMs = currentClip?.duration_ms ?? 0;

  // Load keyframe tracks when the selected clip changes
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl || !currentAnimation) {
      setKeyframeTracks([]);
      return;
    }
    void ctrl.getKeyframeTracks(currentAnimation).then(setKeyframeTracks);
  }, [currentAnimation, setKeyframeTracks]);

  // ── CRUD callbacks ──────────────────────────────────────────────────────

  const handleSeek = useCallback((timeMs: number) => {
    void controllerRef.current?.seekAnimation(timeMs);
  }, []);

  const handleKeyframeAdd = useCallback(
    (trackProperty: string, timeMs: number, value: number) => {
      const ctrl = controllerRef.current;
      const clip = currentAnimation;
      if (!ctrl || !clip) return;

      void ctrl.addKeyframe(clip, trackProperty, timeMs, value).then(() => {
        void ctrl.getKeyframeTracks(clip).then(setKeyframeTracks);
      });
    },
    [currentAnimation, setKeyframeTracks],
  );

  const handleKeyframeRemove = useCallback(
    (trackProperty: string, keyframeId: string) => {
      const ctrl = controllerRef.current;
      const clip = currentAnimation;
      if (!ctrl || !clip) return;

      void ctrl.removeKeyframe(clip, trackProperty, keyframeId).then(() => {
        void ctrl.getKeyframeTracks(clip).then(setKeyframeTracks);
      });
    },
    [currentAnimation, setKeyframeTracks],
  );

  const handleKeyframeUpdate = useCallback(
    (
      trackProperty: string,
      keyframeId: string,
      updates: { timeMs?: number; value?: number; easing?: EasingType },
    ) => {
      const ctrl = controllerRef.current;
      const clip = currentAnimation;
      if (!ctrl || !clip) return;

      void ctrl.updateKeyframe(clip, trackProperty, keyframeId, updates).then(() => {
        void ctrl.getKeyframeTracks(clip).then(setKeyframeTracks);
      });
    },
    [currentAnimation, setKeyframeTracks],
  );

  const handleKeyframeSelect = useCallback(
    (keyframeId: string, multi?: boolean) => {
      setSelectedKeyframeIds(
        multi ? new Set([...selectedKeyframeIds, keyframeId]) : new Set([keyframeId]),
      );
    },
    [selectedKeyframeIds, setSelectedKeyframeIds],
  );

  const handleKeyframeDrag = useCallback(
    (trackProperty: string, keyframeId: string, newTimeMs: number) => {
      const ctrl = controllerRef.current;
      const clip = currentAnimation;
      if (!ctrl || !clip) return;

      void ctrl.updateKeyframe(clip, trackProperty, keyframeId, { timeMs: newTimeMs }).then(() => {
        void ctrl.getKeyframeTracks(clip).then(setKeyframeTracks);
      });
    },
    [currentAnimation, setKeyframeTracks],
  );

  if (!currentAnimation || durationMs <= 0) return null;

  return (
    <KeyframeTimeline
      durationMs={durationMs}
      currentTimeMs={currentTimeMs}
      tracks={tracks}
      selectedKeyframeIds={selectedKeyframeIds}
      onSeek={handleSeek}
      onKeyframeAdd={handleKeyframeAdd}
      onKeyframeRemove={handleKeyframeRemove}
      onKeyframeUpdate={handleKeyframeUpdate}
      onKeyframeSelect={handleKeyframeSelect}
      onKeyframeDrag={handleKeyframeDrag}
    />
  );
}
