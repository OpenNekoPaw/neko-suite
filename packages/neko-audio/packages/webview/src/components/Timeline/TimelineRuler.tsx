/**
 * TimelineRuler — Time ruler with adaptive tick marks and seek-on-click.
 */

import { useCallback, useMemo } from 'react';
import { RULER_HEIGHT } from '../../constants';

interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TimelineRuler({
  totalDuration,
  zoomLevel,
  timelineWidth,
  onSeek,
}: TimelineRulerProps) {
  // Adaptive tick interval based on zoom
  const tickInterval = useMemo(() => {
    const pps = 50 * zoomLevel; // pixels per second
    if (pps >= 200) return 0.5;
    if (pps >= 100) return 1;
    if (pps >= 50) return 2;
    if (pps >= 25) return 5;
    if (pps >= 10) return 10;
    return 30;
  }, [zoomLevel]);

  const ticks = useMemo(() => {
    const result: Array<{ time: number; x: number; major: boolean }> = [];
    const pps = 50 * zoomLevel;
    const majorEvery = tickInterval >= 5 ? 1 : tickInterval >= 1 ? 5 : 10;
    for (let t = 0; t <= totalDuration + 10; t += tickInterval) {
      const tickIndex = Math.round(t / tickInterval);
      result.push({
        time: t,
        x: t * pps,
        major: tickIndex % majorEvery === 0,
      });
    }
    return result;
  }, [totalDuration, zoomLevel, tickInterval]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
      const time = x / (50 * zoomLevel);
      onSeek(Math.max(0, time));
    },
    [zoomLevel, onSeek],
  );

  return (
    <div
      onClick={handleClick}
      className="relative cursor-pointer select-none bg-[var(--ruler-bg)] border-b border-[var(--editor-border)]"
      style={{ width: timelineWidth, height: RULER_HEIGHT }}
    >
      {ticks.map(({ time, x, major }) => (
        <div key={time} className="absolute" style={{ left: x }}>
          <div
            className="absolute bottom-0 bg-[var(--activity-fg)]"
            style={{
              width: 1,
              height: major ? 10 : 5,
              opacity: major ? 0.6 : 0.25,
            }}
          />
          {major && (
            <span className="absolute top-0.5 left-1 text-[10px] text-[var(--activity-inactive)] whitespace-nowrap tabular-nums">
              {formatTime(time)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
