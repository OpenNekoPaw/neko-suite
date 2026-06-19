/**
 * ModelKeyframeTimeline — Adapter wrapping the shared KeyframeTimeline.
 *
 * Reads keyframeTracks / currentTimeMs / selectedKeyframeIds from modelStore,
 * and dispatches add/remove/update operations via postMessage to the extension host.
 */

import React, { useCallback, useMemo } from 'react';
import { KeyframeTimeline } from '@neko/ui/creative';
import type { KeyframeTimelineKeyframeUpdate, KeyframeTimelineTrack } from '@neko/ui/creative';
import type { EasingType } from '@neko/shared';
import { useTranslation } from '../i18n/I18nContext';
import { useModelStore } from '../stores/modelStore';

export interface ModelKeyframeTimelineProps {
  disabled?: boolean;
  onSeek: (clipName: string, timeMs: number) => void;
  onKeyframeMutation: (
    operation: 'add' | 'remove' | 'update',
    payload: Record<string, unknown>,
  ) => void;
}

export function ModelKeyframeTimeline({
  disabled = false,
  onSeek,
  onKeyframeMutation,
}: ModelKeyframeTimelineProps): React.JSX.Element {
  const { t } = useTranslation();
  const keyframeTracks = useModelStore((s) => s.keyframeTracks);
  const currentTimeMs = useModelStore((s) => s.currentTimeMs);
  const selectedKeyframeIds = useModelStore((s) => s.selectedKeyframeIds);
  const activeAnimation = useModelStore((s) => s.activeAnimation);
  const animationClips = useModelStore((s) => s.animationClips);
  const setCurrentTimeMs = useModelStore((s) => s.setCurrentTimeMs);
  const selectKeyframe = useModelStore((s) => s.selectKeyframe);

  // Determine clip duration from active clip
  const durationMs = useMemo(() => {
    if (!activeAnimation) return 5000;
    const clip = animationClips.find((c) => c.name === activeAnimation);
    return clip ? clip.duration * 1000 : 5000;
  }, [activeAnimation, animationClips]);

  const clipName = activeAnimation ?? '';
  const visualTracks = useMemo(
    (): readonly KeyframeTimelineTrack[] =>
      keyframeTracks.map((track) => ({
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
    [keyframeTracks],
  );

  const handleSeek = useCallback(
    (timeMs: number) => {
      if (disabled || !clipName) return;
      setCurrentTimeMs(timeMs);
      onSeek(clipName, timeMs);
    },
    [clipName, disabled, onSeek, setCurrentTimeMs],
  );

  const handleKeyframeAdd = useCallback(
    (trackProperty: string, timeMs: number, _value: number) => {
      if (disabled || !clipName) return;
      // Extract nodeId from trackProperty (format: "nodeId.property")
      const dotIdx = trackProperty.indexOf('.');
      const nodeId = dotIdx >= 0 ? trackProperty.slice(0, dotIdx) : trackProperty;
      const property = dotIdx >= 0 ? trackProperty.slice(dotIdx + 1) : trackProperty;

      onKeyframeMutation('add', {
        clipName,
        nodeId,
        property,
        timestamp: timeMs,
        values: [_value],
      });
    },
    [clipName, disabled, onKeyframeMutation],
  );

  const handleKeyframeRemove = useCallback(
    (_trackProperty: string, keyframeId: string) => {
      if (disabled || !clipName) return;
      onKeyframeMutation('remove', {
        clipName,
        keyframeId,
      });
    },
    [clipName, disabled, onKeyframeMutation],
  );

  const handleKeyframeUpdate = useCallback(
    (_trackProperty: string, keyframeId: string, updates: KeyframeTimelineKeyframeUpdate) => {
      if (disabled || !clipName) return;
      onKeyframeMutation('update', {
        clipName,
        keyframeId,
        timestamp: updates.timeMs,
        values: updates.value !== undefined ? [updates.value] : undefined,
        easing: readDomainEasing(updates.easing),
      });
    },
    [clipName, disabled, onKeyframeMutation],
  );

  const handleKeyframeSelect = useCallback(
    (keyframeId: string, multi?: boolean) => {
      selectKeyframe(keyframeId, multi);
    },
    [selectKeyframe],
  );

  const handleKeyframeDrag = useCallback(
    (_trackProperty: string, keyframeId: string, newTimeMs: number) => {
      if (disabled || !clipName) return;
      onKeyframeMutation('update', {
        clipName,
        keyframeId,
        timestamp: newTimeMs,
      });
    },
    [clipName, disabled, onKeyframeMutation],
  );

  if (keyframeTracks.length === 0) {
    return (
      <div className="p-2 text-xs opacity-40 text-center">
        {activeAnimation ? t('keyframe.noTracks') : t('keyframe.selectClip')}
      </div>
    );
  }

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
  throw new Error(`model keyframe timeline received unsupported easing: ${value}`);
}
