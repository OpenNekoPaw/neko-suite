/**
 * TimelineRuler Component — adapter wrapping the shared TimelineRuler.
 *
 * Preserves the neko-cut layout structure:
 *   [TRACK_LABEL_WIDTH spacer] | [shared canvas ruler]
 *
 * Maps local props (totalDuration, zoomLevel, rulerRef, seek) to
 * the shared component's unified API (duration, pixelsPerSecond, onSeek, scrollRef).
 */

import { memo } from 'react';
import type { RefObject } from 'react';
import { TimelineRuler as SharedRuler } from '@neko/shared/components';
import { PIXELS_PER_SECOND, RULER_HEIGHT, TRACK_LABEL_WIDTH } from '../../constants';

export interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;
  rulerRef: RefObject<HTMLDivElement>;
  seek: (time: number) => void;
}

export const TimelineRuler = memo(function TimelineRuler({
  totalDuration,
  zoomLevel,
  rulerRef,
  seek,
}: TimelineRulerProps) {
  return (
    <div className="flex border-b border-vscode-panel-border">
      {/* Spacer aligned with track label column */}
      <div
        className="shrink-0 border-r border-vscode-panel-border bg-vscode-sidebar-bg"
        style={{ width: TRACK_LABEL_WIDTH }}
      />

      {/* Scrollable ruler area */}
      <div
        ref={rulerRef}
        className="flex-1 overflow-x-auto scrollbar-hide"
        style={{ height: RULER_HEIGHT }}
      >
        <SharedRuler
          duration={totalDuration}
          pixelsPerSecond={PIXELS_PER_SECOND * zoomLevel}
          onSeek={seek}
          height={RULER_HEIGHT}
          scrollRef={rulerRef}
        />
      </div>
    </div>
  );
});
