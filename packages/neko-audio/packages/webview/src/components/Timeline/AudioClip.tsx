/**
 * AudioClip — Single audio element on the timeline.
 * Renders a waveform thumbnail inside a colored clip rectangle.
 */

import { useMemo, useState, useCallback } from 'react';
import type { TimelineElement } from '@neko/shared';
import type { WaveformData } from '../../shared/types';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { useAudioStore } from '../../stores/audioStore';
import { useClipInteraction } from '../../hooks/useClipInteraction';
import { PositionedContextMenu as ContextMenu, type MenuItem } from '@neko/ui/primitives';
import { t } from '../../i18n';
import { getWaveformChannels, type WaveformChannel } from './waveformChannels';

interface AudioClipProps {
  element: TimelineElement;
  trackId: string;
  left: number;
  width: number;
  height: number;
  pps: number;
  waveform?: WaveformData;
  locked?: boolean;
  color?: string;
  aiHighlighted?: boolean;
}

/** Downsample peaks to fit the clip width */
function downsamplePeaks(peaks: number[], targetWidth: number): number[] {
  if (peaks.length <= targetWidth) return peaks;
  const step = peaks.length / targetWidth;
  const result: number[] = [];
  for (let i = 0; i < targetWidth; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      max = Math.max(max, Math.abs(peaks[j]!));
    }
    result.push(max);
  }
  return result;
}

function WaveformThumbnail({
  channels,
  width,
  height,
  color,
}: {
  channels: WaveformChannel[];
  width: number;
  height: number;
  color: string;
}) {
  const channelSamples = useMemo(
    () =>
      channels.map((channel) => ({
        label: channel.label,
        samples: downsamplePeaks(channel.peaks, Math.floor(width)),
      })),
    [channels, width],
  );

  const paths = useMemo(() => {
    if (channelSamples.length === 0) return [];
    const laneHeight = height / channelSamples.length;
    return channelSamples.map((channel, channelIndex) => {
      if (channel.samples.length === 0) {
        return { label: channel.label, d: '', mid: channelIndex * laneHeight + laneHeight / 2 };
      }
      const barWidth = width / channel.samples.length;
      const mid = channelIndex * laneHeight + laneHeight / 2;
      let d = '';
      for (let i = 0; i < channel.samples.length; i++) {
        const x = i * barWidth;
        const amp = channel.samples[i]! * laneHeight * 0.42;
        d += `M${x},${mid - amp} L${x},${mid + amp} `;
      }
      return { label: channel.label, d, mid };
    });
  }, [channelSamples, width, height]);

  if (paths.length === 0) return null;

  const laneHeight = height / paths.length;
  const showLabels = paths.length > 1 && laneHeight >= 12 && width >= 36;

  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      {paths.map((path, index) => (
        <g key={`${path.label}-${index}`}>
          {index > 0 && (
            <line
              x1={0}
              x2={width}
              y1={path.mid - laneHeight / 2}
              y2={path.mid - laneHeight / 2}
              stroke={color}
              strokeWidth={0.5}
              opacity={0.22}
            />
          )}
          <path d={path.d} stroke={color} strokeWidth={1} fill="none" />
          {showLabels && (
            <text x={3} y={path.mid + 3} fill={color} opacity={0.7} fontSize={9}>
              {path.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function AudioClip({
  element,
  trackId,
  left,
  width,
  height,
  pps,
  waveform,
  locked,
  color,
  aiHighlighted,
}: AudioClipProps) {
  const clipName = element.name || 'Untitled';
  const isMuted = element.muted;
  const waveformChannels = useMemo(() => getWaveformChannels(waveform), [waveform]);

  const updateElement = useAudioProjectStore((s) => s.updateElement);
  const removeElement = useAudioProjectStore((s) => s.removeElement);
  const addElement = useAudioProjectStore((s) => s.addElement);
  const splitElementAt = useAudioProjectStore((s) => s.splitElementAt);
  const [previewUpdates, setPreviewUpdates] = useState<Partial<TimelineElement> | null>(null);
  const previewElement = previewUpdates
    ? ({ ...element, ...previewUpdates } as TimelineElement)
    : element;
  const previewLeft = previewElement.startTime * pps;
  const previewWidth = (previewElement.duration ?? 0) * pps;

  const interaction = useClipInteraction({
    trackId,
    elementId: element.id,
    left: previewLeft,
    width: previewWidth,
    pixelsPerSecond: pps,
    locked,
    startTime: element.startTime,
    duration: element.duration ?? 0,
    trimStart: element.trimStart ?? 0,
    onPreview: setPreviewUpdates,
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const currentTime = useAudioStore.getState().currentTime;
      const clipEnd = element.startTime + (element.duration ?? 0);
      const canSplit = currentTime > element.startTime + 0.01 && currentTime < clipEnd - 0.01;

      const items: MenuItem[] = [
        {
          label: isMuted ? t('audio.clip.unmute') : t('audio.clip.mute'),
          onClick: () => updateElement(trackId, element.id, { muted: !isMuted }),
        },
        {
          label: t('audio.clip.duplicate'),
          onClick: () =>
            addElement(trackId, {
              ...element,
              id: crypto.randomUUID(),
              startTime: clipEnd + 0.1,
            }),
        },
        {
          label: t('audio.clip.split'),
          disabled: !canSplit,
          onClick: () => {
            if (!canSplit) return;
            splitElementAt(trackId, element.id, currentTime);
          },
        },
        { separator: true },
        {
          label: t('audio.clip.delete'),
          danger: true,
          onClick: () => removeElement(trackId, element.id),
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [trackId, element, isMuted, updateElement, removeElement, addElement, splitElementAt],
  );

  return (
    <div
      className={`absolute overflow-hidden transition-opacity ${aiHighlighted ? 'neko-ai-clip-highlight' : ''}`}
      style={{
        left: previewLeft,
        top: 3,
        width: Math.max(previewWidth, 4),
        height: height - 5,
        borderRadius: 5,
        background: isMuted
          ? 'var(--clip-muted-bg)'
          : color
            ? `color-mix(in srgb, ${color} 80%, #000 20%)`
            : `color-mix(in srgb, var(--accent, #0A84FF) 80%, #000 20%)`,
        border: `1px solid ${isMuted ? 'var(--clip-muted-border)' : color ? `color-mix(in srgb, ${color} 60%, #000 40%)` : 'color-mix(in srgb, var(--accent, #0A84FF) 60%, #000 40%)'}`,
        boxShadow: isMuted ? 'none' : 'var(--clip-shadow)',
        cursor: interaction.cursor,
        opacity: isMuted ? 0.4 : 1,
      }}
      title={clipName}
      onMouseDown={locked ? undefined : interaction.onMouseDown}
      onMouseMove={locked ? undefined : interaction.onMouseMove}
      onContextMenu={locked ? undefined : handleContextMenu}
    >
      {aiHighlighted && <span className="neko-ai-clip-badge">AI</span>}

      {/* Resize edge indicators */}
      {!locked && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20" />
          <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/20" />
        </>
      )}

      <div
        className="text-[10px] px-1.5 py-0.5 truncate leading-[14px] font-medium"
        style={{ color: isMuted ? 'var(--activity-fg)' : 'var(--clip-text)' }}
      >
        {clipName}
      </div>

      {waveformChannels.length > 0 && previewWidth > 10 && (
        <div className="absolute top-3.5 left-0 right-0 bottom-0">
          <WaveformThumbnail
            channels={waveformChannels}
            width={Math.max(previewWidth - 2, 1)}
            height={Math.max(height - 16, 1)}
            color={isMuted ? 'var(--activity-inactive)' : 'var(--clip-waveform)'}
          />
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
