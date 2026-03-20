/**
 * TrackLane — Single track row: header (left) + element lane (right).
 */

import { useCallback } from 'react';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { AudioClip } from './AudioClip';
import type { TimelineTrack } from '@neko/shared';
import type { WaveformData } from '../../shared/types';

interface TrackLaneProps {
  track: TimelineTrack;
  zoomLevel: number;
  pixelsPerSecond: number;
  trackHeight: number;
  labelWidth: number;
  timelineWidth: number;
  waveforms: Record<string, WaveformData>;
}

export function TrackLane({
  track,
  zoomLevel,
  pixelsPerSecond,
  trackHeight,
  labelWidth,
  timelineWidth,
  waveforms,
}: TrackLaneProps) {
  const toggleTrackField = useAudioProjectStore((s) => s.toggleTrackField);
  const removeTrack = useAudioProjectStore((s) => s.removeTrack);

  const pps = pixelsPerSecond * zoomLevel;

  const handleToggleMute = useCallback(() => {
    toggleTrackField(track.id, 'muted');
  }, [track.id, toggleTrackField]);

  const handleToggleLock = useCallback(() => {
    toggleTrackField(track.id, 'locked');
  }, [track.id, toggleTrackField]);

  const handleRemove = useCallback(() => {
    removeTrack(track.id);
  }, [track.id, removeTrack]);

  return (
    <div
      className="flex border-b border-[var(--editor-border)] transition-opacity"
      style={{ height: trackHeight, opacity: track.muted ? 0.5 : 1 }}
    >
      {/* Track header */}
      <div
        className="flex flex-col justify-center px-2 shrink-0 border-r border-[var(--editor-border)] bg-[var(--track-header-bg)] overflow-hidden"
        style={{ width: labelWidth, minWidth: labelWidth }}
      >
        <div className="text-xs font-medium text-[var(--activity-fg)] truncate mb-1">
          {track.name}
        </div>
        <div className="flex gap-1 items-center">
          <button
            onClick={handleToggleMute}
            title={track.muted ? 'Unmute' : 'Mute'}
            className={`neko-track-btn ${track.muted ? 'active-mute' : ''}`}
          >
            M
          </button>
          <button
            onClick={handleToggleLock}
            title={track.locked ? 'Unlock' : 'Lock'}
            className={`neko-track-btn ${track.locked ? 'active-lock' : ''}`}
          >
            L
          </button>
          <button onClick={handleRemove} title="Remove track" className="neko-track-btn remove">
            ×
          </button>
        </div>
      </div>

      {/* Element lane */}
      <div className="flex-1 relative bg-[var(--timeline-bg)]" style={{ width: timelineWidth }}>
        {track.elements.map((element) => {
          const left = element.startTime * pps;
          const width = element.duration * pps;
          const waveform = waveforms[element.id];

          return (
            <AudioClip
              key={element.id}
              element={element}
              trackId={track.id}
              left={left}
              width={width}
              height={trackHeight - 2}
              waveform={waveform}
              locked={track.locked}
            />
          );
        })}
      </div>
    </div>
  );
}
