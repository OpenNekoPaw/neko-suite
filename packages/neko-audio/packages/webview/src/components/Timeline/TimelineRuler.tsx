/**
 * TimelineRuler — adapter wrapping the shared TimelineRuler.
 *
 * The ruler canvas is viewport-width and redraws based on the tracks
 * container's scroll position (scrollRef). It does NOT scroll itself.
 */

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { TimelineRuler as SharedRuler } from '@neko/shared/components';
import { RULER_HEIGHT } from '../../constants';
import type { TempoMap } from '@neko/shared';
import { formatSecondsAsBarBeat } from '../../utils/beatGrid';

interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;
  onSeek: (time: number) => void;
  /** The scrollable tracks container — ruler mirrors its scrollLeft via redraw. */
  scrollRef?: RefObject<HTMLDivElement>;
  tempoMap?: TempoMap;
}

export function TimelineRuler({
  totalDuration,
  zoomLevel,
  timelineWidth: _timelineWidth,
  onSeek,
  scrollRef,
  tempoMap,
}: TimelineRulerProps) {
  const pixelsPerSecond = 50 * zoomLevel;
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const labelInterval = pixelsPerSecond >= 80 ? 1 : pixelsPerSecond >= 40 ? 2 : 4;
  const labels = useMemo(() => {
    if (!tempoMap || viewportWidth <= 0) {
      return [];
    }

    const visibleStart = scrollLeft / pixelsPerSecond;
    const visibleEnd = Math.min(
      totalDuration,
      (scrollLeft + viewportWidth) / pixelsPerSecond,
    );
    const firstIndex = Math.max(0, Math.floor(visibleStart / labelInterval));
    const result: Array<{ seconds: number; label: string }> = [];
    for (let index = firstIndex; ; index += 1) {
      const seconds = index * labelInterval;
      if (seconds > visibleEnd + labelInterval) {
        break;
      }
      result.push({ seconds, label: formatSecondsAsBarBeat(seconds, tempoMap) });
    }
    return result;
  }, [labelInterval, pixelsPerSecond, scrollLeft, tempoMap, totalDuration, viewportWidth]);

  useEffect(() => {
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return;

    const update = () => {
      setScrollLeft(scrollEl.scrollLeft);
      setViewportWidth(scrollEl.clientWidth);
    };
    update();
    scrollEl.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scrollEl.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollRef]);

  return (
    <div className="relative h-full">
      <SharedRuler
        duration={totalDuration}
        pixelsPerSecond={pixelsPerSecond}
        onSeek={onSeek}
        height={RULER_HEIGHT}
        scrollRef={scrollRef}
      />
      {labels.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {labels.map(({ seconds, label }) => (
            <span
              key={seconds}
              className="absolute top-[2px] text-[9px] tabular-nums text-[var(--activity-inactive)]"
              style={{ left: Math.round(seconds * pixelsPerSecond - scrollLeft) + 3 }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
