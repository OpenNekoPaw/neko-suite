/**
 * VideoDiffViewer Component
 *
 * Real-time H264 dual-stream video diff viewer.
 * Uses StreamingVideoDiffViewer for WebGL-accelerated diff rendering
 * via WebSocket H264 streams from neko-engine.
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';

const logger = new ConsoleLogger('VideoDiffViewer', LogLevel.Info);
import type { VideoDiffViewerProps } from './types';
import {
  StreamingVideoDiffViewer,
  type StreamingVideoDiffViewerHandle,
} from './streaming/StreamingVideoDiffViewer';
import type { DiffMode } from './streaming/DiffRenderer';

// =============================================================================
// Keyframe Diff Downsampling
// =============================================================================

interface KeyframeDiff {
  time: number;
  similarity: number;
}

/**
 * Downsample keyframe diffs to a maximum count for rendering performance.
 * Merges adjacent keyframes by averaging their similarity scores.
 */
function downsampleKeyframeDiffs(
  keyframeDiffs: KeyframeDiff[],
  maxCount: number = 500,
): KeyframeDiff[] {
  if (keyframeDiffs.length <= maxCount) {
    return keyframeDiffs;
  }

  const bucketSize = Math.ceil(keyframeDiffs.length / maxCount);
  const downsampled: KeyframeDiff[] = [];

  for (let i = 0; i < keyframeDiffs.length; i += bucketSize) {
    const bucket = keyframeDiffs.slice(i, i + bucketSize);
    const avgSimilarity = bucket.reduce((sum, kf) => sum + kf.similarity, 0) / bucket.length;
    const midTime = bucket[Math.floor(bucket.length / 2)]?.time ?? bucket[0]?.time ?? 0;

    downsampled.push({
      time: midTime,
      similarity: avgSimilarity,
    });
  }

  return downsampled;
}

// =============================================================================
// Timeline Seek Controls
// =============================================================================

interface SeekControlsProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  diffRegions?: Array<{ start: number; end: number }>;
  /** Disable Play while git show is extracting the previous version */
  isFetchingPrevious?: boolean;
}

const SeekControls = memo(function SeekControls({
  currentTime,
  duration,
  onSeek,
  isPlaying,
  onPlayPause,
  diffRegions,
  isFetchingPrevious,
}: SeekControlsProps) {
  const { t } = useTranslation();
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      {/* Play/Pause button — disabled while previous version is being fetched */}
      <button
        type="button"
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          isFetchingPrevious
            ? 'opacity-40 cursor-not-allowed text-[var(--vscode-foreground)]'
            : 'hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]'
        }`}
        onClick={isFetchingPrevious ? undefined : onPlayPause}
        disabled={isFetchingPrevious}
        title={
          isFetchingPrevious ? t('mediaDiff.video.fetchingPrevious') : isPlaying ? 'Pause' : 'Play'
        }
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>
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
    resolution: {
      current: { width: number; height: number };
      previous: { width: number; height: number };
    };
    fps: { current: number; previous: number };
    codec?: { current: string; previous: string };
    keyframeDiffs?: Array<{ time: number; similarity: number }>;
  };
}

const VideoDetails = memo(function VideoDetails({ details }: VideoDetailsProps) {
  const { t } = useTranslation();
  if (!details || !details.duration) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Downsample keyframe diffs for rendering performance
  const displayKeyframeDiffs = useMemo(
    () => downsampleKeyframeDiffs(details.keyframeDiffs ?? [], 500),
    [details.keyframeDiffs],
  );

  return (
    <div className="p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">
            {t('mediaDiff.video.duration')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{formatDuration(details.duration.previous)}</span>
            <span>&rarr;</span>
            <span className="text-green-400">{formatDuration(details.duration.current)}</span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">
            {t('mediaDiff.video.resolution')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {details.resolution.previous.width}&times;{details.resolution.previous.height}
            </span>
            <span>&rarr;</span>
            <span className="text-green-400">
              {details.resolution.current.width}&times;{details.resolution.current.height}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">
            {t('mediaDiff.video.frameRate')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.fps.previous.toFixed(2)} fps</span>
            <span>&rarr;</span>
            <span className="text-green-400">{details.fps.current.toFixed(2)} fps</span>
          </div>
        </div>
        {details.codec && (
          <div>
            <div className="text-[var(--vscode-descriptionForeground)] mb-1">
              {t('mediaDiff.video.codec')}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">{details.codec.previous}</span>
              <span>&rarr;</span>
              <span className="text-green-400">{details.codec.current}</span>
            </div>
          </div>
        )}
      </div>
      {displayKeyframeDiffs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--vscode-panel-border)]">
          <div className="text-[var(--vscode-descriptionForeground)] mb-2 text-xs">
            {t('mediaDiff.video.keyframeSimilarities')}
            {details.keyframeDiffs && details.keyframeDiffs.length > 500 && (
              <span className="ml-2 text-[10px] opacity-60">
                (showing {displayKeyframeDiffs.length} of {details.keyframeDiffs.length})
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {displayKeyframeDiffs.map((kf, i) => {
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
  details,
  currentFrameSrc,
  previousFrameSrc,
  currentTime = 0,
  onTimeChange,
  sliderPosition = 0.5,
  onSliderChange,
  streamConfig,
  onStreamControl,
  isFetchingPrevious,
  isLoading,
  error,
}: VideoDiffViewerProps) {
  const { t } = useTranslation();
  const [localTime, setLocalTime] = useState(currentTime);
  const [localSliderPosition, setLocalSliderPosition] = useState(sliderPosition);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamingRef = useRef<StreamingVideoDiffViewerHandle>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Track time from streaming frame PTS
  const handleTimeUpdate = useCallback((time: number) => {
    setLocalTime(time);
  }, []);

  const duration =
    streamConfig?.duration ??
    Math.max(details?.duration?.current ?? 0, details?.duration?.previous ?? 0);

  // Map DiffViewMode to streaming DiffMode
  const diffMode: DiffMode =
    viewMode === 'side-by-side'
      ? 'side-by-side'
      : viewMode === 'overlay'
        ? 'heatmap'
        : viewMode === 'onion-skin'
          ? 'flicker'
          : viewMode === 'slider'
            ? 'curtain'
            : 'side-by-side';

  const handleSeek = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
      // Local reset: arm seek filter, flush buffer, reset decoders
      streamingRef.current?.seek(time);
      // Remote: tell extension to seek both engine streams
      onStreamControl?.('seek', { time });
    },
    [onTimeChange, onStreamControl],
  );

  const handleSliderChange = useCallback(
    (position: number) => {
      setLocalSliderPosition(position);
      onSliderChange?.(position);
    },
    [onSliderChange],
  );

  const handlePlayPause = useCallback(() => {
    // Pre-create AudioContext during user gesture to satisfy autoplay policy
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
    }
    // Resume AudioContext if it was suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    setIsPlaying((prev) => {
      const next = !prev;
      onStreamControl?.(next ? 'play' : 'pause');
      if (next) {
        // Resuming: unmute audio
        streamingRef.current?.resumeAudio();
      } else {
        // Pausing: mute audio + extract frames at current time for static display
        streamingRef.current?.pauseAudio();
        if (streamConfig) {
          onTimeChange?.(localTime);
        }
      }
      return next;
    });
  }, [onStreamControl, onTimeChange, localTime, streamConfig]);

  // Handle stream end (one video finished) — do NOT auto-pause,
  // the longer video continues rendering via renderSingle
  const handleStreamEnd = useCallback(() => {
    logger.debug('One stream ended, other continues');
  }, []);

  // ── Dual-mode: render static frames through DiffRenderer when paused ────
  // When paused and streamConfig exists, the StreamingVideoDiffViewer stays
  // mounted (pipeline alive for quick resume). We render extracted JPEG frames
  // through the same DiffRenderer for higher-quality pixel-precise display.
  useEffect(() => {
    if (!isPlaying && streamConfig && currentFrameSrc && previousFrameSrc) {
      void streamingRef.current?.renderStaticPair(currentFrameSrc, previousFrameSrc);
    }
  }, [isPlaying, streamConfig, currentFrameSrc, previousFrameSrc]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <div className="text-2xl mb-2">{'\u26A0\uFE0F'}</div>
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
            {t('mediaDiff.video.analyzing')}
          </div>
        </div>
      </div>
    );
  }

  // Before first play: show Play overlay + controls (no streamConfig yet —
  // streams are created lazily on first Play click, neko-preview pattern)
  if (!streamConfig) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-black">
          {isFetchingPrevious ? (
            // git show in progress — previous version not yet available
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[var(--vscode-button-background)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <div className="text-sm text-[var(--vscode-descriptionForeground)]">
                {t('mediaDiff.video.fetchingPrevious')}
              </div>
            </div>
          ) : isPlaying ? (
            // Streams being created after Play click
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[var(--vscode-button-background)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <div className="text-sm text-[var(--vscode-descriptionForeground)]">
                {t('mediaDiff.video.startingStreams')}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="w-16 h-16 flex items-center justify-center rounded-full bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors text-[var(--vscode-button-foreground)] text-2xl"
              onClick={handlePlayPause}
              title={t('mediaDiff.video.playTitle')}
            >
              {'\u25B6'}
            </button>
          )}
        </div>
        <SeekControls
          currentTime={localTime}
          duration={duration}
          onSeek={handleSeek}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          diffRegions={details?.diffRegions}
          isFetchingPrevious={isFetchingPrevious}
        />
        <VideoDetails details={details} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <StreamingVideoDiffViewer
        ref={streamingRef}
        streamConfig={streamConfig}
        diffMode={diffMode}
        sliderPosition={localSliderPosition}
        onSliderChange={handleSliderChange}
        onStreamControl={onStreamControl}
        onTimeUpdate={handleTimeUpdate}
        onError={setStreamError}
        audioContext={audioContextRef.current ?? undefined}
        onStreamEnd={handleStreamEnd}
      />
      {streamError && (
        <div className="px-3 py-2 text-xs text-red-400 bg-red-900/20 border-t border-red-500/30">
          Stream error: {streamError}
        </div>
      )}
      <SeekControls
        currentTime={localTime}
        duration={duration}
        onSeek={handleSeek}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        diffRegions={details?.diffRegions}
        isFetchingPrevious={isFetchingPrevious}
      />
      <VideoDetails details={details} />
    </div>
  );
});
