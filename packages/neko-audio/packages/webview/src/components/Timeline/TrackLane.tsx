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
      style={{
        display: 'flex',
        height: trackHeight,
        borderBottom: '1px solid var(--vscode-panel-border)',
        opacity: track.muted ? 0.5 : 1,
      }}
    >
      {/* Track header */}
      <div
        style={{
          width: labelWidth,
          minWidth: labelWidth,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 8px',
          borderRight: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-sideBar-background)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--vscode-editor-foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {track.name}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          <button
            onClick={handleToggleMute}
            title={track.muted ? 'Unmute' : 'Mute'}
            style={{
              fontSize: 10,
              padding: '1px 4px',
              cursor: 'pointer',
              background: track.muted
                ? 'var(--vscode-inputValidation-errorBackground)'
                : 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: 2,
            }}
          >
            M
          </button>
          <button
            onClick={handleToggleLock}
            title={track.locked ? 'Unlock' : 'Lock'}
            style={{
              fontSize: 10,
              padding: '1px 4px',
              cursor: 'pointer',
              background: track.locked
                ? 'var(--vscode-inputValidation-warningBackground)'
                : 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: 2,
            }}
          >
            L
          </button>
          <button
            onClick={handleRemove}
            title="Remove track"
            style={{
              fontSize: 10,
              padding: '1px 4px',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: 2,
              marginLeft: 'auto',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Element lane */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          width: timelineWidth,
          background: 'var(--vscode-editor-background)',
        }}
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
