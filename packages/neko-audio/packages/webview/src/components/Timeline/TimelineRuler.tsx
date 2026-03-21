/**
 * TimelineRuler — adapter wrapping the shared TimelineRuler.
 *
 * Translates audio-editor props (totalDuration, zoomLevel, timelineWidth)
 * to the shared component's unified API (duration, pixelsPerSecond).
 */

import { TimelineRuler as SharedRuler } from '@neko/shared/components';
import { RULER_HEIGHT } from '../../constants';

interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;
  onSeek: (time: number) => void;
}

export function TimelineRuler({ totalDuration, zoomLevel, timelineWidth: _timelineWidth, onSeek }: TimelineRulerProps) {
  return (
    <SharedRuler
      duration={totalDuration}
      pixelsPerSecond={50 * zoomLevel}
      onSeek={onSeek}
      height={RULER_HEIGHT}
    />
  );
}
