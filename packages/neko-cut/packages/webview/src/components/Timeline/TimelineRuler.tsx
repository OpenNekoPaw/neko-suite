/**
 * TimelineRuler Component
 * 时间线标尺 - 显示时间标记和播放头位置
 */

import { RefObject, useMemo, useCallback, memo } from 'react';
import { formatTimeShort } from '../../utils';
import { PIXELS_PER_SECOND, RULER_HEIGHT, TRACK_LABEL_WIDTH } from '../../constants';

export interface TimelineRulerProps {
  // Timeline dimensions
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;

  // Ruler ref for scroll synchronization
  rulerRef: RefObject<HTMLDivElement>;

  // Seek action
  seek: (time: number) => void;
}

/**
 * TimelineRuler Component
 *
 * 功能:
 * - 显示时间标记 (根据缩放级别自适应间隔)
 * - 点击标尺跳转到指定时间
 * - 与轨道区域滚动同步 (通过 ref)
 */
export const TimelineRuler = memo(function TimelineRuler({
  totalDuration,
  zoomLevel,
  timelineWidth,
  rulerRef,
  seek,
}: TimelineRulerProps) {
  // Generate time markers based on zoom level
  const timeMarkers = useMemo(() => {
    // Adaptive interval based on zoom level
    let interval: number;
    if (zoomLevel >= 4) {
      interval = 1; // 1s intervals at 400%+ zoom
    } else if (zoomLevel >= 2) {
      interval = 2; // 2s intervals at 200-400% zoom
    } else if (zoomLevel >= 1) {
      interval = 5; // 5s intervals at 100-200% zoom
    } else if (zoomLevel >= 0.5) {
      interval = 10; // 10s intervals at 50-100% zoom
    } else {
      interval = 30; // 30s intervals at < 50% zoom
    }

    const count = Math.ceil(totalDuration / interval) + 1;
    return Array.from({ length: count }, (_, i) => i * interval);
  }, [totalDuration, zoomLevel]);

  // Handle ruler click to seek
  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / (PIXELS_PER_SECOND * zoomLevel);
    seek(Math.max(0, Math.min(totalDuration, time)));
  }, [zoomLevel, seek, totalDuration]);

  return (
    <div className="flex border-b border-vscode-panel-border">
      {/* Track labels header - spacer to align with track labels */}
      <div
        className="shrink-0 border-r border-vscode-panel-border bg-vscode-sidebar-bg"
        style={{ width: TRACK_LABEL_WIDTH }}
      />

      {/* Ruler */}
      <div
        ref={rulerRef}
        className="flex-1 overflow-x-auto relative cursor-pointer scrollbar-hide"
        style={{ height: RULER_HEIGHT }}
        onClick={handleRulerClick}
      >
        <div
          className="relative h-full"
          style={{ width: timelineWidth }}
        >
          {timeMarkers.map((time) => (
            <div
              key={time}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: time * PIXELS_PER_SECOND * zoomLevel }}
            >
              <div className="h-2 w-px bg-vscode-panel-border" />
              <span className="text-[10px] text-vscode-description mt-0.5">
                {formatTimeShort(time)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
