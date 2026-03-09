/**
 * VideoDiffViewer Component
 * 视频对比查看器 - 支持关键帧对比和时间轴导航
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import type { VideoDiffViewerProps } from './types';

// =============================================================================
// Video Player
// =============================================================================

interface VideoPlayerProps {
  src: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  label: string;
  muted?: boolean;
}

const VideoPlayer = memo(function VideoPlayer({
  src,
  currentTime,
  isPlaying,
  onTimeUpdate,
  label,
  muted = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isPlaying) return;

    // Sync time when not playing
    if (Math.abs(video.currentTime - currentTime) > 0.1) {
      video.currentTime = currentTime;
    }
  }, [currentTime, isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && isPlaying) {
      onTimeUpdate(video.currentTime);
    }
  }, [isPlaying, onTimeUpdate]);

  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2 font-medium">
        {label}
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black rounded border border-[var(--vscode-panel-border)]">
        <video
          ref={videoRef}
          src={src}
          className="max-w-full max-h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          muted={muted}
          playsInline
        />
      </div>
    </div>
  );
});

// =============================================================================
// Side-by-Side View
// =============================================================================

interface SideBySideVideoViewProps {
  currentSrc: string;
  previousSrc: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
}

const SideBySideVideoView = memo(function SideBySideVideoView({
  currentSrc,
  previousSrc,
  currentTime,
  isPlaying,
  onTimeUpdate,
}: SideBySideVideoViewProps) {
  return (
    <div className="flex flex-1 gap-2 p-2 overflow-hidden">
      <VideoPlayer
        src={previousSrc}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTimeUpdate={onTimeUpdate}
        label="Previous (HEAD)"
      />
      <VideoPlayer
        src={currentSrc}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTimeUpdate={onTimeUpdate}
        label="Current (Working)"
      />
    </div>
  );
});

// =============================================================================
// Slider View for Video
// =============================================================================

interface SliderVideoViewProps {
  currentSrc: string;
  previousSrc: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  sliderPosition: number;
  onSliderChange: (position: number) => void;
}

const SliderVideoView = memo(function SliderVideoView({
  currentSrc,
  previousSrc,
  currentTime,
  isPlaying,
  onTimeUpdate,
  sliderPosition,
  onSliderChange,
}: SliderVideoViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentVideoRef = useRef<HTMLVideoElement>(null);
  const previousVideoRef = useRef<HTMLVideoElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sync playback
  useEffect(() => {
    const current = currentVideoRef.current;
    const previous = previousVideoRef.current;
    if (!current || !previous) return;

    if (isPlaying) {
      current.play().catch(() => {});
      previous.play().catch(() => {});
    } else {
      current.pause();
      previous.pause();
    }
  }, [isPlaying]);

  // Sync time
  useEffect(() => {
    const current = currentVideoRef.current;
    const previous = previousVideoRef.current;
    if (!current || !previous || isPlaying) return;

    if (Math.abs(current.currentTime - currentTime) > 0.1) {
      current.currentTime = currentTime;
      previous.currentTime = currentTime;
    }
  }, [currentTime, isPlaying]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSliderChange(Math.max(0, Math.min(1, x)));
    },
    [isDragging, onSliderChange],
  );

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  const handleTimeUpdate = useCallback(() => {
    const video = currentVideoRef.current;
    if (video && isPlaying) {
      onTimeUpdate(video.currentTime);
    }
  }, [isPlaying, onTimeUpdate]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 m-2 overflow-hidden bg-black rounded border border-[var(--vscode-panel-border)] cursor-col-resize select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    >
      {/* Previous video (full) */}
      <video
        ref={previousVideoRef}
        src={previousSrc}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        muted
        playsInline
      />

      {/* Current video (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${(1 - sliderPosition) * 100}% 0 0)` }}
      >
        <video
          ref={currentVideoRef}
          src={currentSrc}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          onTimeUpdate={handleTimeUpdate}
          muted
          playsInline
        />
      </div>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-col-resize z-10"
        style={{ left: `${sliderPosition * 100}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center">
          <span className="text-black text-xs">↔</span>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
        Previous
      </div>
      <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
        Current
      </div>
    </div>
  );
});

// =============================================================================
// Playback Controls
// =============================================================================

interface PlaybackControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

const PlaybackControls = memo(function PlaybackControls({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
}: PlaybackControlsProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      {/* Play/Pause Button */}
      <button
        type="button"
        className="w-8 h-8 flex items-center justify-center bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={onPlayPause}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Time Display */}
      <span className="text-xs text-[var(--vscode-foreground)] font-mono min-w-[100px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Seek Bar */}
      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer"
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
    resolution: {
      current: { width: number; height: number };
      previous: { width: number; height: number };
    };
    fps: { current: number; previous: number };
    codec?: { current: string; previous: string };
    keyframeSimilarities?: Array<{ time: number; similarity: number }>;
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
        {/* Duration */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Duration</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{formatDuration(details.duration.previous)}</span>
            <span>→</span>
            <span className="text-green-400">{formatDuration(details.duration.current)}</span>
          </div>
        </div>

        {/* Resolution */}
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

        {/* FPS */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Frame Rate</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.fps.previous.toFixed(2)} fps</span>
            <span>→</span>
            <span className="text-green-400">{details.fps.current.toFixed(2)} fps</span>
          </div>
        </div>

        {/* Codec */}
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

      {/* Keyframe Similarities */}
      {details.keyframeSimilarities && details.keyframeSimilarities.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--vscode-panel-border)]">
          <div className="text-[var(--vscode-descriptionForeground)] mb-2 text-xs">
            Keyframe Similarities
          </div>
          <div className="flex gap-1">
            {details.keyframeSimilarities.map((kf, i) => {
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
  currentSrc,
  previousSrc,
  details,
  currentTime = 0,
  onTimeChange,
  isPlaying = false,
  onPlayPause,
  sliderPosition = 0.5,
  onSliderChange,
  isLoading,
  error,
}: VideoDiffViewerProps) {
  const [localTime, setLocalTime] = useState(currentTime);
  const [localPlaying, setLocalPlaying] = useState(isPlaying);
  const [localSliderPosition, setLocalSliderPosition] = useState(sliderPosition);

  const duration = Math.max(details?.duration.current ?? 0, details?.duration.previous ?? 0);

  const handleTimeUpdate = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange],
  );

  const handlePlayPause = useCallback(() => {
    setLocalPlaying(!localPlaying);
    onPlayPause?.();
  }, [localPlaying, onPlayPause]);

  const handleSeek = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange],
  );

  const handleSliderChange = useCallback(
    (position: number) => {
      setLocalSliderPosition(position);
      onSliderChange?.(position);
    },
    [onSliderChange],
  );

  // Error state
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--vscode-button-background)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <div className="text-sm text-[var(--vscode-descriptionForeground)]">
            Loading videos...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Video view based on mode */}
      {(viewMode === 'side-by-side' || viewMode === 'overlay' || viewMode === 'onion-skin') && (
        <SideBySideVideoView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          currentTime={localTime}
          isPlaying={localPlaying}
          onTimeUpdate={handleTimeUpdate}
        />
      )}

      {viewMode === 'slider' && (
        <SliderVideoView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          currentTime={localTime}
          isPlaying={localPlaying}
          onTimeUpdate={handleTimeUpdate}
          sliderPosition={localSliderPosition}
          onSliderChange={handleSliderChange}
        />
      )}

      {/* Playback Controls */}
      <PlaybackControls
        currentTime={localTime}
        duration={duration}
        isPlaying={localPlaying}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
      />

      {/* Details Panel */}
      <VideoDetails details={details} />
    </div>
  );
});

export default VideoDiffViewer;
