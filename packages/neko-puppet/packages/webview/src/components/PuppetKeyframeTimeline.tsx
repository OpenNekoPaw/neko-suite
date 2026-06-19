/**
 * PuppetKeyframeTimeline — Adapter wrapping the shared KeyframeTimeline
 *
 * Connects puppet-store state (tracks, currentTimeMs, selectedKeyframeIds)
 * to the shared KeyframeTimeline component. Delegates CRUD operations
 * to the IPuppetController for engine dispatch.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { KeyframeTimeline } from '@neko/ui/creative';
import type { KeyframeTimelineKeyframeUpdate, KeyframeTimelineTrack } from '@neko/ui/creative';
import type { EasingType } from '@neko/shared';
import type { IPuppetController } from '../animation';
import { usePuppetStore } from '../stores/puppet-store';

interface PuppetKeyframeTimelineProps {
  controller: IPuppetController | null;
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
  const visualTracks = useMemo(
    (): readonly KeyframeTimelineTrack[] =>
      tracks.map((track) => ({
        id: track.property,
        label: track.label,
        defaultValue: track.defaultValue,
        keyframes: track.keyframes.map((keyframe) => ({
          id: keyframe.id,
          timeMs: keyframe.timeMs,
          value: keyframe.value,
          easing: keyframe.easing,
        })),
      })),
    [tracks],
  );

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
    (trackProperty: string, keyframeId: string, updates: KeyframeTimelineKeyframeUpdate) => {
      const ctrl = controllerRef.current;
      const clip = currentAnimation;
      if (!ctrl || !clip) return;

      void ctrl
        .updateKeyframe(clip, trackProperty, keyframeId, {
          timeMs: updates.timeMs,
          value: updates.value,
          easing: readDomainEasing(updates.easing),
        })
        .then(() => {
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
      tracks={visualTracks}
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

function readDomainEasing(value: KeyframeTimelineKeyframeUpdate['easing']): EasingType | undefined {
  switch (value) {
    case undefined:
      return undefined;
    case 'linear':
      return 'linear';
    case 'ease-in-cubic':
      return 'ease-in-cubic';
    case 'ease-out-cubic':
      return 'ease-out-cubic';
    case 'ease-in-out-cubic':
      return 'ease-in-out-cubic';
    default:
      break;
  }
  throw new Error(`puppet keyframe timeline received unsupported easing: ${value}`);
}
