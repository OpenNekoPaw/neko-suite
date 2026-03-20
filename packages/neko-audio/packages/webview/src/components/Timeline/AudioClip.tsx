/**
 * AudioClip — Single audio element on the timeline.
 * Renders a waveform thumbnail inside a colored clip rectangle.
 */

import { useMemo } from 'react';
import type { TimelineElement } from '@neko/shared';
import type { WaveformData } from '../../shared/types';

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
}: {
  peaks: number[];
  width: number;
  height: number;
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
      <path d={pathD} stroke="rgba(255,255,255,0.75)" strokeWidth={1} fill="none" />
    </svg>
  );
}

export function AudioClip({ element, left, width, height, waveform, locked }: AudioClipProps) {
  const clipName = element.name || 'Untitled';
  const isMuted = element.muted;

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
          ? 'rgba(120, 120, 128, 0.25)'
          : `color-mix(in srgb, var(--accent, #0A84FF) 80%, #000 20%)`,
        border: `1px solid ${isMuted ? 'rgba(120,120,128,0.30)' : 'color-mix(in srgb, var(--accent, #0A84FF) 60%, #000 40%)'}`,
        boxShadow: isMuted
          ? 'none'
          : '0 1px 4px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
        cursor: locked ? 'not-allowed' : 'grab',
        opacity: isMuted ? 0.4 : 1,
      }}
      title={clipName}
    >
      {/* Clip label */}
      <div
        className="text-[10px] px-1.5 py-0.5 truncate leading-[14px] font-medium"
        style={{ color: 'rgba(255,255,255,0.92)' }}
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
          />
        </div>
      )}
    </div>
  );
}
