/**
 * ModelKeyframeTimeline — Adapter wrapping the shared KeyframeTimeline.
 *
 * Reads keyframeTracks / currentTimeMs / selectedKeyframeIds from modelStore,
 * and dispatches add/remove/update operations via postMessage to the extension host.
 */

import React, { useCallback, useMemo } from 'react';
import { KeyframeTimeline } from '@neko/shared/components';
import type { EasingType } from '@neko/shared';
import { useModelStore } from '../stores/modelStore';

// Acquire VSCode API if available
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export function ModelKeyframeTimeline(): React.JSX.Element {
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

  const handleSeek = useCallback(
    (timeMs: number) => {
      setCurrentTimeMs(timeMs);
    },
    [setCurrentTimeMs],
  );

  const handleKeyframeAdd = useCallback(
    (trackProperty: string, timeMs: number, _value: number) => {
      if (!clipName) return;
      // Extract nodeId from trackProperty (format: "nodeId.property")
      const dotIdx = trackProperty.indexOf('.');
      const nodeId = dotIdx >= 0 ? trackProperty.slice(0, dotIdx) : trackProperty;
      const property = dotIdx >= 0 ? trackProperty.slice(dotIdx + 1) : trackProperty;

      vscode?.postMessage({
        type: 'addKeyframe',
        clipName,
        nodeId,
        property,
        timestamp: timeMs,
        values: [_value],
      });
    },
    [clipName],
  );

  const handleKeyframeRemove = useCallback(
    (_trackProperty: string, keyframeId: string) => {
      if (!clipName) return;
      vscode?.postMessage({
        type: 'removeKeyframe',
        clipName,
        keyframeId,
      });
    },
    [clipName],
  );

  const handleKeyframeUpdate = useCallback(
    (
      _trackProperty: string,
      keyframeId: string,
      updates: { timeMs?: number; value?: number; easing?: EasingType },
    ) => {
      if (!clipName) return;
      vscode?.postMessage({
        type: 'updateKeyframe',
        clipName,
        keyframeId,
        timestamp: updates.timeMs,
        values: updates.value !== undefined ? [updates.value] : undefined,
        easing: updates.easing,
      });
    },
    [clipName],
  );

  const handleKeyframeSelect = useCallback(
    (keyframeId: string, multi?: boolean) => {
      selectKeyframe(keyframeId, multi);
    },
    [selectKeyframe],
  );

  const handleKeyframeDrag = useCallback(
    (_trackProperty: string, keyframeId: string, newTimeMs: number) => {
      if (!clipName) return;
      vscode?.postMessage({
        type: 'updateKeyframe',
        clipName,
        keyframeId,
        timestamp: newTimeMs,
      });
    },
    [clipName],
  );

  if (keyframeTracks.length === 0) {
    return (
      <div className="p-2 text-xs opacity-40 text-center">
        {activeAnimation ? 'No keyframe tracks' : 'Select an animation clip'}
      </div>
    );
  }

  return (
    <KeyframeTimeline
      durationMs={durationMs}
      currentTimeMs={currentTimeMs}
      tracks={keyframeTracks}
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
