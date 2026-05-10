/**
 * TrackLane — Single track row: header (left) + element lane (right).
 */

import { useCallback, useRef, useState } from 'react';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { AudioClip } from './AudioClip';
import { TrackHeader } from './TrackHeader';
import { ContextMenu } from '@neko/shared/components';
import type { MenuItem } from '@neko/shared/components';
import type { TimelineTrack } from '@neko/shared';
import type { WaveformData } from '../../shared/types';
import { t } from '../../i18n';

interface TrackLaneProps {
  track: TimelineTrack;
  zoomLevel: number;
  pixelsPerSecond: number;
  labelWidth: number;
  timelineWidth: number;
  waveforms: Record<string, WaveformData>;
}

export function TrackLane({
  track,
  zoomLevel,
  pixelsPerSecond,
  labelWidth,
  timelineWidth,
  waveforms,
}: TrackLaneProps) {
  const toggleTrackField = useAudioProjectStore((s) => s.toggleTrackField);
  const removeTrack = useAudioProjectStore((s) => s.removeTrack);
  const reorderTrack = useAudioProjectStore((s) => s.reorderTrack);
  const tracks = useAudioProjectStore((s) => s.audioProjectData?.tracks ?? []);
  const uiState = useAudioProjectStore((s) => s.getTrackUIState(track.id));

  const pps = pixelsPerSecond * zoomLevel;
  const trackIndex = tracks.findIndex((tr) => tr.id === track.id);
  const trackHeight = uiState.height;

  const setTrackHeight = useAudioProjectStore((s) => s.setTrackHeight);

  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );

  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startHeight: trackHeight };

      const onMove = (me: MouseEvent) => {
        if (!resizeRef.current) return;
        const dy = me.clientY - resizeRef.current.startY;
        setTrackHeight(track.id, resizeRef.current.startHeight + dy);
      };
      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [track.id, trackHeight, setTrackHeight],
  );

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
    <div className="relative" style={{ opacity: track.muted ? 0.5 : 1 }}>
      <div className="flex border-b border-[var(--editor-border)]" style={{ height: trackHeight }}>
        <TrackHeader
          track={track}
          uiState={uiState}
          width={labelWidth}
          height={trackHeight}
          onContextMenu={handleHeaderContextMenu}
        />

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
                pps={pps}
                waveform={waveform}
                locked={track.locked}
                color={uiState.color}
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

      {/* Track height resize handle */}
      <div
        className="absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize hover:bg-[var(--accent)] z-10"
        style={{ opacity: 0.3 }}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}
