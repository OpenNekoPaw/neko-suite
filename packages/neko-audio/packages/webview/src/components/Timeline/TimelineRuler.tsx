/**
 * TimelineRuler — adapter wrapping the shared TimelineRuler.
 *
 * The ruler canvas is viewport-width and redraws based on the tracks
 * container's scroll position (scrollRef). It does NOT scroll itself.
 */

import type { RefObject } from 'react';
import { TimelineRuler as SharedRuler } from '@neko/shared/components';
import { RULER_HEIGHT } from '../../constants';

interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;
  onSeek: (time: number) => void;
  /** The scrollable tracks container — ruler mirrors its scrollLeft via redraw. */
  scrollRef?: RefObject<HTMLDivElement>;
}

export function TimelineRuler({
  totalDuration,
  zoomLevel,
  timelineWidth: _timelineWidth,
  onSeek,
  scrollRef,
}: TimelineRulerProps) {
  return (
    <SharedRuler
      duration={totalDuration}
      pixelsPerSecond={50 * zoomLevel}
      onSeek={onSeek}
      height={RULER_HEIGHT}
      scrollRef={scrollRef}
    />
  );
}
