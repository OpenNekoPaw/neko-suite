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

  const trackBtnClass =
    'text-[10px] px-1 py-px cursor-pointer text-[var(--vscode-descriptionForeground)] border border-[var(--vscode-panel-border)] rounded-sm';

  return (
    <div
      className="flex border-b border-[var(--vscode-panel-border)] transition-opacity"
      style={{ height: trackHeight, opacity: track.muted ? 0.5 : 1 }}
    >
      {/* Track header */}
      <div
        className="flex flex-col justify-center px-2 shrink-0 border-r border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] overflow-hidden"
        style={{ width: labelWidth, minWidth: labelWidth }}
      >
        <div className="text-xs font-medium text-[var(--vscode-editor-foreground)] truncate">
          {track.name}
        </div>
        <div className="flex gap-1 mt-0.5">
          <button
            onClick={handleToggleMute}
            title={track.muted ? 'Unmute' : 'Mute'}
            className={`${trackBtnClass} ${track.muted ? 'bg-[var(--vscode-inputValidation-errorBackground)]' : 'bg-transparent'}`}
          >
            M
          </button>
          <button
            onClick={handleToggleLock}
            title={track.locked ? 'Unlock' : 'Lock'}
            className={`${trackBtnClass} ${track.locked ? 'bg-[var(--vscode-inputValidation-warningBackground)]' : 'bg-transparent'}`}
          >
            L
          </button>
          <button
            onClick={handleRemove}
            title="Remove track"
            className={`${trackBtnClass} bg-transparent ml-auto`}
          >
            ×
          </button>
        </div>
      </div>

      {/* Element lane */}
      <div
        className="flex-1 relative bg-[var(--vscode-editor-background)]"
        style={{ width: timelineWidth }}
      >
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
