/**
 * AudioTimeline — Multi-track timeline container
 *
 * Layout: TimelineRuler on top, TrackLane rows below.
 * Left column: track headers. Right column: scrollable element lanes.
 */

import { useRef, useCallback, useMemo } from 'react';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { useAudioStore } from '../../stores/audioStore';
import { TimelineRuler } from './TimelineRuler';
import { TrackLane } from './TrackLane';
import { PIXELS_PER_SECOND, TRACK_HEIGHT, RULER_HEIGHT, TRACK_LABEL_WIDTH } from '../../constants';
import { getTotalDuration } from '@neko/shared';

export function AudioTimeline() {
  const tracks = useAudioProjectStore((s) => s.audioProjectData?.tracks ?? []);
  const waveforms = useAudioProjectStore((s) => s.waveforms);
  const currentTime = useAudioStore((s) => s.currentTime);
  const zoomLevel = useAudioStore((s) => s.speed); // reuse speed as zoom for now
  const zoom = Math.max(zoomLevel, 0.1);

  const tracksRef = useRef<HTMLDivElement>(null);

  const totalDuration = useMemo(() => {
    return Math.max(getTotalDuration(tracks), 30);
  }, [tracks]);

  const timelineWidth = Math.max((totalDuration + 10) * PIXELS_PER_SECOND * zoom, 800);

  const handleSeek = useCallback((time: number) => {
    useAudioStore.getState().setCurrentTime(time);
  }, []);

  // Scroll sync is handled by the ruler canvas via scrollRef — no manual sync needed.

  const playheadLeft = currentTime * PIXELS_PER_SECOND * zoom;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--timeline-bg)]">
      {/* Ruler row */}
      <div
        className="flex shrink-0 border-b border-[var(--editor-border)]"
        style={{ height: RULER_HEIGHT }}
      >
        <div
          className="shrink-0 border-r border-[var(--editor-border)]"
          style={{ width: TRACK_LABEL_WIDTH, minWidth: TRACK_LABEL_WIDTH }}
        />
        <div className="flex-1 overflow-hidden relative">
          <TimelineRuler
            totalDuration={totalDuration}
            zoomLevel={zoom}
            timelineWidth={timelineWidth}
            onSeek={handleSeek}
            scrollRef={tracksRef}
          />
        </div>
      </div>

      {/* Tracks area */}
      <div ref={tracksRef} className="flex-1 overflow-auto relative">
        <div className="flex flex-col" style={{ minWidth: timelineWidth + TRACK_LABEL_WIDTH }}>
          {tracks.map((track) => (
            <TrackLane
              key={track.id}
              track={track}
              zoomLevel={zoom}
              pixelsPerSecond={PIXELS_PER_SECOND}
              trackHeight={TRACK_HEIGHT}
              labelWidth={TRACK_LABEL_WIDTH}
              timelineWidth={timelineWidth}
              waveforms={waveforms}
            />
          ))}

          {tracks.length === 0 && (
            <div
              className="neko-timeline-guides flex items-center justify-center text-[13px] text-[var(--activity-inactive)]"
              style={{ height: TRACK_HEIGHT * 6, width: '100%' }}
            >
              No tracks — import audio files to get started
            </div>
          )}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-[var(--waveform-cursor)] pointer-events-none z-10"
          style={{ left: TRACK_LABEL_WIDTH + playheadLeft }}
        />
      </div>
    </div>
  );
}
