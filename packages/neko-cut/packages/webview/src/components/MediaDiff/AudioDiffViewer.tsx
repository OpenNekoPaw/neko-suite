/**
 * AudioDiffViewer Component
 * 音频对比查看器 - 支持波形对比和播放控制
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import type { AudioDiffViewerProps } from './types';

// =============================================================================
// Waveform Canvas
// =============================================================================

interface WaveformCanvasProps {
  peaks: number[];
  width: number;
  height: number;
  color: string;
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
}

const WaveformCanvas = memo(function WaveformCanvas({
  peaks,
  width,
  height,
  color,
  currentTime = 0,
  duration = 0,
  onSeek,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const centerY = height / 2;
    const peaksPerPixel = peaks.length / width;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw centerline
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw waveform
    ctx.fillStyle = color;

    for (let x = 0; x < width; x++) {
      const startPeak = Math.floor(x * peaksPerPixel);
      const endPeak = Math.floor((x + 1) * peaksPerPixel);

      let maxPeak = 0;
      for (let i = startPeak; i < endPeak && i < peaks.length; i++) {
        if (peaks[i]! > maxPeak) maxPeak = peaks[i]!;
      }

      const barHeight = Math.max(1, maxPeak * (height - 4));
      const y = centerY - barHeight / 2;
      ctx.fillRect(x, y, 1, barHeight);
    }

    // Draw playhead
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [peaks, width, height, color, currentTime, duration]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || !duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSeek(x * duration);
    },
    [onSeek, duration],
  );

  return (
    <canvas
      ref={canvasRef}
      className="block cursor-pointer"
      style={{ width, height }}
      onClick={handleClick}
    />
  );
});

// =============================================================================
// Side-by-Side Waveform View
// =============================================================================

interface SideBySideWaveformProps {
  currentWaveform: number[];
  previousWaveform: number[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const SideBySideWaveform = memo(function SideBySideWaveform({
  currentWaveform,
  previousWaveform,
  currentTime,
  duration,
  onSeek,
}: SideBySideWaveformProps) {
  return (
    <div className="flex flex-1 gap-2 p-2 overflow-hidden">
      {/* Previous Waveform */}
      <div className="flex-1 flex flex-col">
        <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2 font-medium text-center">
          Previous (HEAD)
        </div>
        <div className="flex-1 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)] p-2">
          <WaveformCanvas
            peaks={previousWaveform}
            width={400}
            height={100}
            color="#ef4444"
            currentTime={currentTime}
            duration={duration}
            onSeek={onSeek}
          />
        </div>
      </div>

      {/* Current Waveform */}
      <div className="flex-1 flex flex-col">
        <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2 font-medium text-center">
          Current (Working)
        </div>
        <div className="flex-1 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)] p-2">
          <WaveformCanvas
            peaks={currentWaveform}
            width={400}
            height={100}
            color="#22c55e"
            currentTime={currentTime}
            duration={duration}
            onSeek={onSeek}
          />
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Overlay Waveform View
// =============================================================================

interface OverlayWaveformProps {
  currentWaveform: number[];
  previousWaveform: number[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const OverlayWaveform = memo(function OverlayWaveform({
  currentWaveform,
  previousWaveform,
  currentTime,
  duration,
  onSeek,
}: OverlayWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 800;
  const height = 200;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const centerY = height / 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw centerline
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw previous waveform (red, semi-transparent)
    const prevPeaksPerPixel = previousWaveform.length / width;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
    for (let x = 0; x < width; x++) {
      const startPeak = Math.floor(x * prevPeaksPerPixel);
      const endPeak = Math.floor((x + 1) * prevPeaksPerPixel);

      let maxPeak = 0;
      for (let i = startPeak; i < endPeak && i < previousWaveform.length; i++) {
        if (previousWaveform[i]! > maxPeak) maxPeak = previousWaveform[i]!;
      }

      const barHeight = Math.max(1, maxPeak * (height - 4));
      const y = centerY - barHeight / 2;
      ctx.fillRect(x, y, 1, barHeight);
    }

    // Draw current waveform (green, semi-transparent)
    const currPeaksPerPixel = currentWaveform.length / width;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.5)';
    for (let x = 0; x < width; x++) {
      const startPeak = Math.floor(x * currPeaksPerPixel);
      const endPeak = Math.floor((x + 1) * currPeaksPerPixel);

      let maxPeak = 0;
      for (let i = startPeak; i < endPeak && i < currentWaveform.length; i++) {
        if (currentWaveform[i]! > maxPeak) maxPeak = currentWaveform[i]!;
      }

      const barHeight = Math.max(1, maxPeak * (height - 4));
      const y = centerY - barHeight / 2;
      ctx.fillRect(x, y, 1, barHeight);
    }

    // Draw playhead
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [currentWaveform, previousWaveform, currentTime, duration]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSeek(x * duration);
    },
    [onSeek, duration],
  );

  return (
    <div className="flex-1 m-2 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)] p-4">
      <div className="flex items-center justify-center gap-4 mb-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500/50 rounded" />
          <span className="text-[var(--vscode-descriptionForeground)]">Previous</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500/50 rounded" />
          <span className="text-[var(--vscode-descriptionForeground)]">Current</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="block cursor-pointer mx-auto"
        style={{ width, height }}
        onClick={handleClick}
      />
    </div>
  );
});

// =============================================================================
// Audio Player Controls
// =============================================================================

interface AudioPlayerControlsProps {
  currentSrc: string;
  previousSrc: string;
  currentTime: number;
  duration: number;
  playingVersion: 'current' | 'previous' | 'both';
  onPlayingVersionChange: (version: 'current' | 'previous' | 'both') => void;
  onTimeChange: (time: number) => void;
}

const AudioPlayerControls = memo(function AudioPlayerControls({
  currentSrc,
  previousSrc,
  currentTime,
  duration,
  playingVersion,
  onPlayingVersionChange,
  onTimeChange,
}: AudioPlayerControlsProps) {
  const currentAudioRef = useRef<HTMLAudioElement>(null);
  const previousAudioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = useCallback(() => {
    const current = currentAudioRef.current;
    const previous = previousAudioRef.current;

    if (isPlaying) {
      current?.pause();
      previous?.pause();
      setIsPlaying(false);
    } else {
      if (playingVersion === 'current' || playingVersion === 'both') {
        current?.play().catch(() => {});
      }
      if (playingVersion === 'previous' || playingVersion === 'both') {
        previous?.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  }, [isPlaying, playingVersion]);

  // Sync time
  useEffect(() => {
    const current = currentAudioRef.current;
    const previous = previousAudioRef.current;

    if (current && Math.abs(current.currentTime - currentTime) > 0.1) {
      current.currentTime = currentTime;
    }
    if (previous && Math.abs(previous.currentTime - currentTime) > 0.1) {
      previous.currentTime = currentTime;
    }
  }, [currentTime]);

  // Handle time update
  useEffect(() => {
    const current = currentAudioRef.current;
    if (!current) return;

    const handleTimeUpdate = () => {
      onTimeChange(current.currentTime);
    };

    current.addEventListener('timeupdate', handleTimeUpdate);
    return () => current.removeEventListener('timeupdate', handleTimeUpdate);
  }, [onTimeChange]);

  // Update muted state based on playing version
  useEffect(() => {
    const current = currentAudioRef.current;
    const previous = previousAudioRef.current;

    if (current) {
      current.muted = playingVersion === 'previous';
    }
    if (previous) {
      previous.muted = playingVersion === 'current';
    }
  }, [playingVersion]);

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      {/* Hidden audio elements */}
      <audio ref={currentAudioRef} src={currentSrc} />
      <audio ref={previousAudioRef} src={previousSrc} />

      {/* Play/Pause Button */}
      <button
        type="button"
        className="w-8 h-8 flex items-center justify-center bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={handlePlayPause}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Version Toggle */}
      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'previous'
              ? 'bg-red-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('previous')}
        >
          Previous
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'both'
              ? 'bg-purple-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('both')}
        >
          Both
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'current'
              ? 'bg-green-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('current')}
        >
          Current
        </button>
      </div>

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
          onChange={(e) => onTimeChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
});

// =============================================================================
// Audio Details Panel
// =============================================================================

interface AudioDetailsProps {
  details?: {
    duration: { current: number; previous: number };
    sampleRate: { current: number; previous: number };
    channels: { current: number; previous: number };
    bitrate?: { current: number; previous: number };
    silentRegions?: Array<{ start: number; end: number }>;
  };
}

const AudioDetails = memo(function AudioDetails({ details }: AudioDetailsProps) {
  if (!details) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${parseFloat(secs) < 10 ? '0' : ''}${secs}`;
  };

  const formatBitrate = (bps: number) => {
    if (bps >= 1000) return `${(bps / 1000).toFixed(0)} kbps`;
    return `${bps} bps`;
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

        {/* Sample Rate */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Sample Rate</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.sampleRate.previous} Hz</span>
            <span>→</span>
            <span className="text-green-400">{details.sampleRate.current} Hz</span>
          </div>
        </div>

        {/* Channels */}
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Channels</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {details.channels.previous === 1
                ? 'Mono'
                : details.channels.previous === 2
                  ? 'Stereo'
                  : `${details.channels.previous}ch`}
            </span>
            <span>→</span>
            <span className="text-green-400">
              {details.channels.current === 1
                ? 'Mono'
                : details.channels.current === 2
                  ? 'Stereo'
                  : `${details.channels.current}ch`}
            </span>
          </div>
        </div>

        {/* Bitrate */}
        {details.bitrate && (
          <div>
            <div className="text-[var(--vscode-descriptionForeground)] mb-1">Bitrate</div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">{formatBitrate(details.bitrate.previous)}</span>
              <span>→</span>
              <span className="text-green-400">{formatBitrate(details.bitrate.current)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Silent Regions */}
      {details.silentRegions && details.silentRegions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--vscode-panel-border)]">
          <div className="text-[var(--vscode-descriptionForeground)] mb-1 text-xs">
            Silent Regions Detected
          </div>
          <div className="flex flex-wrap gap-1">
            {details.silentRegions.map((region, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded"
              >
                {formatDuration(region.start)} - {formatDuration(region.end)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Main AudioDiffViewer Component
// =============================================================================

export const AudioDiffViewer = memo(function AudioDiffViewer({
  viewMode,
  currentSrc,
  previousSrc,
  details,
  currentWaveform = [],
  previousWaveform = [],
  currentTime = 0,
  onTimeChange,
  playingVersion = 'current',
  onPlayingVersionChange,
  isLoading,
  error,
}: AudioDiffViewerProps) {
  const [localTime, setLocalTime] = useState(currentTime);
  const [localPlayingVersion, setLocalPlayingVersion] = useState(playingVersion);

  const duration = Math.max(details?.duration.current ?? 0, details?.duration.previous ?? 0);

  const handleTimeChange = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange],
  );

  const handlePlayingVersionChange = useCallback(
    (version: 'current' | 'previous' | 'both') => {
      setLocalPlayingVersion(version);
      onPlayingVersionChange?.(version);
    },
    [onPlayingVersionChange],
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
            Loading audio files...
          </div>
        </div>
      </div>
    );
  }

  // Generate placeholder waveform if none provided
  const displayCurrentWaveform =
    currentWaveform.length > 0
      ? currentWaveform
      : Array(100)
          .fill(0.5)
          .map(() => Math.random());
  const displayPreviousWaveform =
    previousWaveform.length > 0
      ? previousWaveform
      : Array(100)
          .fill(0.5)
          .map(() => Math.random());

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Waveform view based on mode */}
      {viewMode === 'side-by-side' && (
        <SideBySideWaveform
          currentWaveform={displayCurrentWaveform}
          previousWaveform={displayPreviousWaveform}
          currentTime={localTime}
          duration={duration}
          onSeek={handleTimeChange}
        />
      )}

      {(viewMode === 'overlay' || viewMode === 'slider' || viewMode === 'onion-skin') && (
        <OverlayWaveform
          currentWaveform={displayCurrentWaveform}
          previousWaveform={displayPreviousWaveform}
          currentTime={localTime}
          duration={duration}
          onSeek={handleTimeChange}
        />
      )}

      {/* Player Controls */}
      <AudioPlayerControls
        currentSrc={currentSrc}
        previousSrc={previousSrc}
        currentTime={localTime}
        duration={duration}
        playingVersion={localPlayingVersion}
        onPlayingVersionChange={handlePlayingVersionChange}
        onTimeChange={handleTimeChange}
      />

      {/* Details Panel */}
      <AudioDetails details={details} />
    </div>
  );
});

export default AudioDiffViewer;
