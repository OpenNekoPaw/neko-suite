/**
 * TrackLane — Single track row: header (left) + element lane (right).
 */

import { useCallback, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { AudioClip } from './AudioClip';
import { AutomationLane } from './AutomationLane';
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
  const uiState = useAudioProjectStore((s) => s.getTrackUIState(track.id), shallow);
  const hasAiHighlight = useAudioProjectStore((s) => s.hasAiTrackHighlight(track.id));
  const aiOperationHighlights = useAudioProjectStore((s) => s.aiOperationHighlights);

  const pps = pixelsPerSecond * zoomLevel;
  const trackIndex = tracks.findIndex((tr) => tr.id === track.id);
  const trackHeight = uiState.height;

  const setTrackHeight = useAudioProjectStore((s) => s.setTrackHeight);

  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const [automationExpanded, setAutomationExpanded] = useState(false);

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

  const automationHeight = automationExpanded ? 88 + (uiState.automation?.length ?? 0) * 44 : 0;
  const rowHeight = trackHeight + automationHeight;

  return (
    <div
      className={`relative ${hasAiHighlight ? 'neko-ai-track-highlight' : ''}`}
      style={{ opacity: track.muted ? 0.5 : 1 }}
    >
      <div className="flex border-b border-[var(--editor-border)]" style={{ minHeight: rowHeight }}>
        <TrackHeader
          track={track}
          uiState={uiState}
          width={labelWidth}
          height={rowHeight}
          automationExpanded={automationExpanded}
          onToggleAutomation={() => setAutomationExpanded((expanded) => !expanded)}
          onContextMenu={handleHeaderContextMenu}
        />

        {/* Element lane */}
        <div className="flex-1 bg-[var(--timeline-bg)]" style={{ width: timelineWidth }}>
          <div className="relative" style={{ height: trackHeight }}>
            {track.elements.map((element) => {
              const left = element.startTime * pps;
              const width = (element.duration ?? 0) * pps;
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
                  aiHighlighted={Object.values(aiOperationHighlights).some((highlight) =>
                    highlight.elementIds.includes(element.id),
                  )}
                />
              );
            })}
          </div>
          {automationExpanded && (
            <AutomationLane trackId={track.id} uiState={uiState} pps={pps} width={timelineWidth} />
          )}
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
