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
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path
        d={pathD}
        stroke="var(--vscode-editor-foreground)"
        strokeWidth={1}
        strokeOpacity={0.6}
        fill="none"
      />
    </svg>
  );
}

export function AudioClip({ element, left, width, height, waveform, locked }: AudioClipProps) {
  const clipName = element.name || 'Untitled';
  const isMuted = element.muted;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 1,
        width: Math.max(width, 4),
        height,
        background: isMuted
          ? 'var(--vscode-editorInlayHint-background)'
          : 'var(--vscode-editor-selectionBackground)',
        borderRadius: 3,
        overflow: 'hidden',
        cursor: locked ? 'not-allowed' : 'grab',
        opacity: isMuted ? 0.4 : 1,
        border: '1px solid var(--vscode-panel-border)',
      }}
      title={clipName}
    >
      {/* Clip label */}
      <div
        style={{
          fontSize: 10,
          padding: '1px 4px',
          color: 'var(--vscode-editor-foreground)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: '14px',
        }}
      >
        {clipName}
      </div>

      {/* Waveform */}
      {waveform && width > 10 && (
        <div style={{ position: 'absolute', top: 14, left: 0, right: 0, bottom: 0 }}>
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
