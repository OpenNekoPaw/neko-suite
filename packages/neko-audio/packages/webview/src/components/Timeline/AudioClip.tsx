/**
 * AudioClip — Single audio element on the timeline.
 * Renders a waveform thumbnail inside a colored clip rectangle.
 */

import { useMemo, useState, useCallback } from 'react';
import type { TimelineElement } from '@neko/shared';
import type { WaveformData } from '../../shared/types';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { ContextMenu } from '@neko/shared/components';
import type { MenuItem } from '@neko/shared/components';
import { t } from '../../i18n';

interface AudioClipProps {
  element: TimelineElement;
  trackId: string;
  left: number;
  width: number;
  height: number;
  waveform?: WaveformData;
  locked?: boolean;
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
  peaks,
  width,
  height,
  color,
}: {
  peaks: number[];
  width: number;
  height: number;
  color: string;
}) {
  const samples = useMemo(() => downsamplePeaks(peaks, Math.floor(width)), [peaks, width]);
  const mid = height / 2;

  const pathD = useMemo(() => {
    if (samples.length === 0) return '';
    const barWidth = width / samples.length;
    // Draw as mirrored bars
    let d = '';
    for (let i = 0; i < samples.length; i++) {
      const x = i * barWidth;
      const amp = samples[i]! * mid * 0.9;
      d += `M${x},${mid - amp} L${x},${mid + amp} `;
    }
    return d;
  }, [samples, width, mid]);

  return (
    <svg width={width} height={height} className="block">
      <path d={pathD} stroke={color} strokeWidth={1} fill="none" />
    </svg>
  );
}

export function AudioClip({
  element,
  trackId,
  left,
  width,
  height,
  waveform,
  locked,
}: AudioClipProps) {
  const clipName = element.name || 'Untitled';
  const isMuted = element.muted;

  const updateElement = useAudioProjectStore((s) => s.updateElement);
  const removeElement = useAudioProjectStore((s) => s.removeElement);
  const addElement = useAudioProjectStore((s) => s.addElement);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
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
              startTime: element.startTime + (element.duration ?? 0) + 0.1,
            }),
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
    [trackId, element, isMuted, updateElement, removeElement, addElement],
  );

  return (
    <div
      className="absolute overflow-hidden transition-opacity"
      style={{
        left,
        top: 3,
        width: Math.max(width, 4),
        height: height - 5,
        borderRadius: 5,
        background: isMuted
          ? 'var(--clip-muted-bg)'
          : `color-mix(in srgb, var(--accent, #0A84FF) 80%, #000 20%)`,
        border: `1px solid ${isMuted ? 'var(--clip-muted-border)' : 'color-mix(in srgb, var(--accent, #0A84FF) 60%, #000 40%)'}`,
        boxShadow: isMuted ? 'none' : 'var(--clip-shadow)',
        cursor: locked ? 'not-allowed' : 'grab',
        opacity: isMuted ? 0.4 : 1,
      }}
      title={clipName}
      onContextMenu={locked ? undefined : handleContextMenu}
    >
      {/* Clip label — white on colored bg; theme-aware on muted (semi-transparent) bg */}
      <div
        className="text-[10px] px-1.5 py-0.5 truncate leading-[14px] font-medium"
        style={{ color: isMuted ? 'var(--activity-fg)' : 'var(--clip-text)' }}
      >
        {clipName}
      </div>

      {/* Waveform */}
      {waveform && width > 10 && (
        <div className="absolute top-3.5 left-0 right-0 bottom-0">
          <WaveformThumbnail
            peaks={waveform.peaks}
            width={Math.max(width - 2, 1)}
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
