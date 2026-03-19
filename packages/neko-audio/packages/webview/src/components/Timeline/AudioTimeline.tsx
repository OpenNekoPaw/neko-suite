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
  const rulerRef = useRef<HTMLDivElement>(null);

  const totalDuration = useMemo(() => {
    return Math.max(getTotalDuration(tracks), 30);
  }, [tracks]);

  const timelineWidth = Math.max((totalDuration + 10) * PIXELS_PER_SECOND * zoom, 800);

  const handleSeek = useCallback((time: number) => {
    useAudioStore.getState().setCurrentTime(time);
  }, []);

  // Sync horizontal scroll between ruler and tracks
  const handleTracksScroll = useCallback(() => {
    if (tracksRef.current && rulerRef.current) {
      rulerRef.current.scrollLeft = tracksRef.current.scrollLeft;
    }
  }, []);

  const playheadLeft = currentTime * PIXELS_PER_SECOND * zoom;

  return (
    <div
      className="audio-timeline"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
    >
      {/* Ruler row */}
      <div
        style={{
          display: 'flex',
          height: RULER_HEIGHT,
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        <div
          style={{
            width: TRACK_LABEL_WIDTH,
            minWidth: TRACK_LABEL_WIDTH,
            borderRight: '1px solid var(--vscode-panel-border)',
          }}
        />
        <div ref={rulerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <TimelineRuler
            totalDuration={totalDuration}
            zoomLevel={zoom}
            timelineWidth={timelineWidth}
            onSeek={handleSeek}
          />
        </div>
      </div>

      {/* Tracks area */}
      <div
        ref={tracksRef}
        onScroll={handleTracksScroll}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: timelineWidth + TRACK_LABEL_WIDTH,
          }}
        >
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
              style={{
                height: TRACK_HEIGHT * 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--vscode-descriptionForeground)',
                fontSize: 13,
              }}
            >
              No tracks — import audio files to get started
            </div>
          )}
        </div>

        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: TRACK_LABEL_WIDTH + playheadLeft,
            width: 1,
            background: 'var(--vscode-editor-foreground)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      </div>
    </div>
  );
}
