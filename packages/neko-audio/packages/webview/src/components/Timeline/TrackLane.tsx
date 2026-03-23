/**
 * TrackLane — Single track row: header (left) + element lane (right).
 */

import { useCallback, useState } from 'react';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { AudioClip } from './AudioClip';
import { ContextMenu } from '@neko/shared/components';
import type { MenuItem } from '@neko/shared/components';
import type { TimelineTrack } from '@neko/shared';
import type { WaveformData } from '../../shared/types';
import { t } from '../../i18n';

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
  const reorderTrack = useAudioProjectStore((s) => s.reorderTrack);
  const tracks = useAudioProjectStore((s) => s.audioProjectData?.tracks ?? []);

  const pps = pixelsPerSecond * zoomLevel;
  const trackIndex = tracks.findIndex((tr) => tr.id === track.id);

  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );

  const handleToggleMute = useCallback(() => {
    toggleTrackField(track.id, 'muted');
  }, [track.id, toggleTrackField]);

  const handleToggleLock = useCallback(() => {
    toggleTrackField(track.id, 'locked');
  }, [track.id, toggleTrackField]);

  const handleRemove = useCallback(() => {
    removeTrack(track.id);
  }, [track.id, removeTrack]);

  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items: MenuItem[] = [
        {
          label: track.muted ? t('audio.track.unmute') : t('audio.track.mute'),
          onClick: () => toggleTrackField(track.id, 'muted'),
        },
        {
          label: track.locked ? t('audio.track.unlock') : t('audio.track.lock'),
          onClick: () => toggleTrackField(track.id, 'locked'),
        },
        { separator: true },
        {
          label: t('audio.track.moveUp'),
          disabled: trackIndex <= 0,
          onClick: () => reorderTrack(trackIndex, trackIndex - 1),
        },
        {
          label: t('audio.track.moveDown'),
          disabled: trackIndex < 0 || trackIndex >= tracks.length - 1,
          onClick: () => reorderTrack(trackIndex, trackIndex + 1),
        },
        { separator: true },
        {
          label: t('audio.track.delete'),
          danger: true,
          onClick: () => removeTrack(track.id),
        },
      ];
      setHeaderMenu({ x: e.clientX, y: e.clientY, items });
    },
    [track, trackIndex, tracks.length, toggleTrackField, reorderTrack, removeTrack],
  );

  return (
    <div
      className="flex border-b border-[var(--editor-border)] transition-opacity"
      style={{ height: trackHeight, opacity: track.muted ? 0.5 : 1 }}
    >
      {/* Track header */}
      <div
        className="flex flex-col justify-center px-2 shrink-0 border-r border-[var(--editor-border)] bg-[var(--track-header-bg)] overflow-hidden"
        style={{ width: labelWidth, minWidth: labelWidth }}
        onContextMenu={handleHeaderContextMenu}
      >
        <div className="text-xs font-medium text-[var(--activity-fg)] truncate mb-1">
          {track.name}
        </div>
        <div className="flex gap-1 items-center">
          <button
            onClick={handleToggleMute}
            title={track.muted ? t('audio.track.unmute') : t('audio.track.mute')}
            className={`neko-track-btn ${track.muted ? 'active-mute' : ''}`}
          >
            M
          </button>
          <button
            onClick={handleToggleLock}
            title={track.locked ? t('audio.track.unlock') : t('audio.track.lock')}
            className={`neko-track-btn ${track.locked ? 'active-lock' : ''}`}
          >
            L
          </button>
          <button
            onClick={handleRemove}
            title={t('audio.track.delete')}
            className="neko-track-btn remove"
          >
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

      {headerMenu && (
        <ContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          items={headerMenu.items}
          onClose={() => setHeaderMenu(null)}
        />
      )}
    </div>
  );
}
