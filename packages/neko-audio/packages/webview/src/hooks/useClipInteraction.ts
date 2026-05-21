/**
 * useClipInteraction — Drag-to-move + edge-resize for audio clips.
 *
 * Returns mouse-event handlers and a cursor style.
 * Split is handled externally via context menu, not here.
 */

import { useRef, useCallback, useMemo } from 'react';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';
import type { TimelineElement } from '@neko/shared';
import type { BeatGridState } from '../utils/beatGrid';
import { getProjectTempoMap, snapSecondsToGrid } from '../utils/beatGrid';
import type { TempoMap } from '@neko/shared';

type Edge = 'left' | 'right' | null;

const EDGE_HIT_ZONE = 6; // px

interface UseClipInteractionOptions {
  trackId: string;
  elementId: string;
  left: number;
  width: number;
  pixelsPerSecond: number;
  locked?: boolean;
  startTime: number;
  duration: number;
  trimStart: number;
  onPreview?: (updates: Partial<TimelineElement> | null) => void;
}

interface ClipInteractionResult {
  onMouseDown: (e: React.MouseEvent) => void;
  cursor: string;
  onMouseMove: (e: React.MouseEvent) => void;
}

export function computeClipInteractionUpdates(
  type: 'move' | 'resize-left' | 'resize-right',
  deltaPixels: number,
  pixelsPerSecond: number,
  state: {
    origStartTime: number;
    origDuration: number;
    origTrimStart: number;
  },
  tempoMap: TempoMap,
  beatGrid: BeatGridState,
): Partial<TimelineElement> {
  const dt = deltaPixels / pixelsPerSecond;

  if (type === 'move') {
    const newStart = snapSecondsToGrid(
      Math.max(0, state.origStartTime + dt),
      tempoMap,
      beatGrid,
    );
    return { startTime: newStart };
  }

  if (type === 'resize-left') {
    const clampedDt = Math.max(-state.origTrimStart, Math.min(state.origDuration - 0.01, dt));
    const snappedStart = snapSecondsToGrid(
      state.origStartTime + clampedDt,
      tempoMap,
      beatGrid,
    );
    const snappedDt = snappedStart - state.origStartTime;
    return {
      startTime: snappedStart,
      duration: state.origDuration - snappedDt,
      trimStart: state.origTrimStart + snappedDt,
    };
  }

  const rawEnd = state.origStartTime + Math.max(0.01, state.origDuration + dt);
  const snappedEnd = snapSecondsToGrid(rawEnd, tempoMap, beatGrid);
  const newDuration = Math.max(0.01, snappedEnd - state.origStartTime);
  return { duration: newDuration };
}

export function useClipInteraction({
  trackId,
  elementId,
  left,
  width,
  pixelsPerSecond,
  locked,
  startTime,
  duration,
  trimStart,
  onPreview,
}: UseClipInteractionOptions): ClipInteractionResult {
  const updateElement = useAudioProjectStore((s) => s.updateElement);
  const beatGrid = useAudioStore((s) => s.beatGrid);
  const tempoMap = useAudioProjectStore((s) => getProjectTempoMap(s.audioProjectData));

  const dragState = useRef<{
    type: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    origStartTime: number;
    origDuration: number;
    origTrimStart: number;
  } | null>(null);

  const hoveredEdge = useRef<Edge>(null);

  const detectEdge = useCallback((e: React.MouseEvent): Edge => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX < EDGE_HIT_ZONE) return 'left';
    if (localX > rect.width - EDGE_HIT_ZONE) return 'right';
    return null;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (locked) return;
      hoveredEdge.current = detectEdge(e);
    },
    [locked, detectEdge],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (locked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const edge = detectEdge(e);
      const type = edge === 'left' ? 'resize-left' : edge === 'right' ? 'resize-right' : 'move';

      dragState.current = {
        type,
        startX: e.clientX,
        origStartTime: startTime,
        origDuration: duration,
        origTrimStart: trimStart,
      };

      const computeUpdates = (clientX: number): Partial<TimelineElement> | null => {
        const state = dragState.current;
        if (!state) return null;

        return computeClipInteractionUpdates(
          state.type,
          clientX - state.startX,
          pixelsPerSecond,
          state,
          tempoMap,
          beatGrid,
        );
      };

      const onMove = (me: MouseEvent) => {
        onPreview?.(computeUpdates(me.clientX));
      };

      const onUp = (me: MouseEvent) => {
        const updates = computeUpdates(me.clientX);
        if (updates) {
          updateElement(trackId, elementId, updates);
        }
        onPreview?.(null);
        dragState.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [
      locked,
      detectEdge,
      startTime,
      duration,
      trimStart,
      pixelsPerSecond,
      beatGrid,
      tempoMap,
      trackId,
      elementId,
      updateElement,
      onPreview,
    ],
  );

  const cursor = useMemo(() => {
    if (locked) return 'not-allowed';
    return 'grab';
  }, [locked]);

  return {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    cursor,
  };
}
