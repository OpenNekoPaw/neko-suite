/**
 * VideoDiffViewer Component
 * Video comparison viewer using extracted frame images (via neko-engine).
 * Unlike neko-cut which uses <video> elements, this renders JPEG frames
 * extracted by the Extension Host and sent as ArrayBuffer → Blob URL.
 */

import { memo, useState, useCallback } from 'react';
import type { VideoDiffViewerProps } from './types';
import { VideoFrameRenderer } from './VideoFrameRenderer';
import type { WebGLRenderMode } from './VideoFrameRenderer';

// =============================================================================
// Frame Display
// =============================================================================

interface FrameDisplayProps {
  src?: string;
  label: string;
}

const FrameDisplay = memo(function FrameDisplay({ src, label }: FrameDisplayProps) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2 font-medium">
        {label}
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black rounded border border-[var(--vscode-panel-border)]">
        {src ? (
          <img
            src={src}
            alt={label}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-[var(--vscode-descriptionForeground)] text-xs">
            No frame data
          </div>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// Side-by-Side Frame View
// =============================================================================

interface SideBySideFrameViewProps {
  currentFrameSrc?: string;
  previousFrameSrc?: string;
}

const SideBySideFrameView = memo(function SideBySideFrameView({
  currentFrameSrc,
  previousFrameSrc,
}: SideBySideFrameViewProps) {
  return (
    <div className="flex flex-1 gap-2 p-2 overflow-hidden">
      <FrameDisplay src={previousFrameSrc} label="Previous (HEAD)" />
      <FrameDisplay src={currentFrameSrc} label="Current (Working)" />
    </div>
  );
});

// =============================================================================
// Timeline Seek Controls
// =============================================================================

interface SeekControlsProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  diffRegions?: Array<{ start: number; end: number }>;
}

const SeekControls = memo(function SeekControls({
  currentTime,
  duration,
  onSeek,
  diffRegions,
}: SeekControlsProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <span className="text-xs text-[var(--vscode-foreground)] font-mono min-w-[100px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <div className="flex-1 relative">
        {/* Diff region overlay on the timeline */}
        {diffRegions && duration > 0 && (
          <div className="absolute inset-0 flex items-center pointer-events-none">
            {diffRegions.map((region, i) => {
              const left = (region.start / duration) * 100;
              const width = ((region.end - region.start) / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute h-3 rounded-sm bg-red-500/30 border border-red-500/50"
                  style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%` }}
                />
              );
            })}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer relative z-10"
        />
      </div>
    </div>
  );
});

// =============================================================================
// Video Details Panel
// =============================================================================

interface VideoDetailsProps {
  details?: {
    duration: { current: number; previous: number };
    resolution: { current: { width: number; height: number }; previous: { width: number; height: number } };
    fps: { current: number; previous: number };
    codec?: { current: string; previous: string };
    keyframeDiffs?: Array<{ time: number; similarity: number }>;
  };
}

const VideoDetails = memo(function VideoDetails({ details }: VideoDetailsProps) {
  if (!details) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Duration</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{formatDuration(details.duration.previous)}</span>
            <span>→</span>
            <span className="text-green-400">{formatDuration(details.duration.current)}</span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Resolution</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {details.resolution.previous.width}×{details.resolution.previous.height}
            </span>
            <span>→</span>
            <span className="text-green-400">
              {details.resolution.current.width}×{details.resolution.current.height}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Frame Rate</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.fps.previous.toFixed(2)} fps</span>
            <span>→</span>
            <span className="text-green-400">{details.fps.current.toFixed(2)} fps</span>
          </div>
        </div>
        {details.codec && (
          <div>
            <div className="text-[var(--vscode-descriptionForeground)] mb-1">Codec</div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">{details.codec.previous}</span>
              <span>→</span>
              <span className="text-green-400">{details.codec.current}</span>
            </div>
          </div>
        )}
      </div>
      {details.keyframeDiffs && details.keyframeDiffs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--vscode-panel-border)]">
          <div className="text-[var(--vscode-descriptionForeground)] mb-2 text-xs">
            Keyframe Similarities
          </div>
          <div className="flex gap-1">
            {details.keyframeDiffs.map((kf, i) => {
              const percentage = Math.round(kf.similarity * 100);
              let bgColor = 'bg-red-500';
              if (percentage >= 90) bgColor = 'bg-green-500';
              else if (percentage >= 70) bgColor = 'bg-yellow-500';
              else if (percentage >= 50) bgColor = 'bg-orange-500';

              return (
                <div
                  key={i}
                  className={`flex-1 h-6 ${bgColor} rounded flex items-center justify-center text-white text-[10px] font-medium`}
                  title={`${formatDuration(kf.time)}: ${percentage}%`}
                >
                  {percentage}%
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Main VideoDiffViewer Component
// =============================================================================

export const VideoDiffViewer = memo(function VideoDiffViewer({
  viewMode,
  currentSrc: _currentSrc,
  previousSrc: _previousSrc,
  details,
  currentFrameSrc,
  previousFrameSrc,
  currentTime = 0,
  onTimeChange,
  sliderPosition = 0.5,
  onSliderChange,
  isLoading,
  error,
}: VideoDiffViewerProps) {
  const [localTime, setLocalTime] = useState(currentTime);
  const [localSliderPosition, setLocalSliderPosition] = useState(sliderPosition);

  const duration = Math.max(
    details?.duration.current ?? 0,
    details?.duration.previous ?? 0
  );

  const handleSeek = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange]
  );

  const handleSliderChange = useCallback(
    (position: number) => {
      setLocalSliderPosition(position);
      onSliderChange?.(position);
    },
    [onSliderChange]
  );

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--vscode-button-background)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <div className="text-sm text-[var(--vscode-descriptionForeground)]">
            Loading video frames...
          </div>
        </div>
      </div>
    );
  }

  // Map DiffViewMode to WebGL render mode
  const webglMode: WebGLRenderMode | null =
    viewMode === 'overlay' ? 'heatmap' :
    viewMode === 'onion-skin' ? 'flicker' :
    viewMode === 'slider' ? 'curtain' :
    null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {viewMode === 'side-by-side' && (
        <SideBySideFrameView
          currentFrameSrc={currentFrameSrc}
          previousFrameSrc={previousFrameSrc}
        />
      )}
      {webglMode && (
        <VideoFrameRenderer
          currentFrameSrc={currentFrameSrc}
          previousFrameSrc={previousFrameSrc}
          mode={webglMode}
          sliderPosition={localSliderPosition}
          onSliderChange={handleSliderChange}
        />
      )}
      <SeekControls
        currentTime={localTime}
        duration={duration}
        onSeek={handleSeek}
        diffRegions={details?.diffRegions}
      />
      <VideoDetails details={details} />
    </div>
  );
});

export default VideoDiffViewer;
