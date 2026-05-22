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
import { getVisibleBarBeatLabels } from '../../utils/beatGrid';

interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  onSeek: (time: number) => void;
  /** The scrollable tracks container — ruler mirrors its scrollLeft via redraw. */
  scrollRef?: RefObject<HTMLDivElement>;
  tempoMap?: TempoMap;
}

export function TimelineRuler({
  totalDuration,
  zoomLevel,
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
    return getVisibleBarBeatLabels({
      tempoMap,
      visibleStart,
      visibleEnd,
      scrollLeft,
      pixelsPerSecond,
      minLabelSpacingPx: Math.max(70, labelInterval * pixelsPerSecond),
    });
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
        showLabels={false}
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
