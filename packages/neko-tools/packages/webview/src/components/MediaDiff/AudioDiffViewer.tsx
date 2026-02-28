/**
 * AudioDiffViewer Component
 * Audio comparison viewer with waveform visualization and playback controls
 */

import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { AudioStreamClient } from '@neko/neko-client';
import type { AudioDiffViewerProps } from './types';
import type { AudioStreamConfig } from '@neko/shared';

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
  /** Zoom level: 1 = full view, 2 = half visible, etc. */
  zoom?: number;
  /** Scroll offset as fraction of total duration (0-1) */
  scrollOffset?: number;
  onSeek?: (time: number) => void;
}

const WaveformCanvas = memo(function WaveformCanvas({
  peaks,
  width,
  height,
  color,
  currentTime = 0,
  duration = 0,
  zoom = 1,
  scrollOffset = 0,
  onSeek,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Viewport: which portion of peaks to render
    const visibleFraction = 1 / zoom;
    const startFraction = scrollOffset;
    const startPeakIdx = Math.floor(startFraction * peaks.length);
    const visiblePeakCount = Math.ceil(visibleFraction * peaks.length);
    const peaksPerPixel = visiblePeakCount / width;

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

    // Draw waveform (only visible portion)
    ctx.fillStyle = color;
    for (let x = 0; x < width; x++) {
      const s = startPeakIdx + Math.floor(x * peaksPerPixel);
      const e = startPeakIdx + Math.floor((x + 1) * peaksPerPixel);

      let maxPeak = 0;
      for (let i = s; i < e && i < peaks.length; i++) {
        if (peaks[i]! > maxPeak) maxPeak = peaks[i]!;
      }

      const barHeight = Math.max(1, maxPeak * (height - 4));
      const y = centerY - barHeight / 2;
      ctx.fillRect(x, y, 1, barHeight);
    }

    // Draw playhead (only if within visible range)
    if (duration > 0) {
      const timeFraction = currentTime / duration;
      if (timeFraction >= startFraction && timeFraction <= startFraction + visibleFraction) {
        const playheadX = ((timeFraction - startFraction) / visibleFraction) * width;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
    }
  }, [peaks, width, height, color, currentTime, duration, zoom, scrollOffset]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xFraction = (e.clientX - rect.left) / rect.width;
      // Map click position back to absolute time
      const visibleFraction = 1 / zoom;
      const absoluteFraction = scrollOffset + xFraction * visibleFraction;
      onSeek(absoluteFraction * duration);
    },
    [onSeek, duration, zoom, scrollOffset]
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
// Overlay Waveform View
// =============================================================================

interface OverlayWaveformProps {
  currentWaveform: number[];
  previousWaveform: number[];
  currentTime: number;
  duration: number;
  zoom: number;
  scrollOffset: number;
  onZoomChange: (zoom: number) => void;
  onScrollOffsetChange: (offset: number) => void;
  onSeek: (time: number) => void;
}

const OverlayWaveform = memo(function OverlayWaveform({
  currentWaveform,
  previousWaveform,
  currentTime,
  duration,
  zoom,
  scrollOffset,
  onZoomChange,
  onScrollOffsetChange,
  onSeek,
}: OverlayWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const height = 200;
  const isDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.floor(entry.contentRect.width - 32)); // subtract padding
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = containerWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const centerY = height / 2;
    const visibleFraction = 1 / zoom;
    const startFraction = scrollOffset;

    ctx.clearRect(0, 0, width, height);

    // Draw centerline
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Helper to draw a waveform with viewport
    const drawWaveform = (peaks: number[], fillStyle: string) => {
      const startIdx = Math.floor(startFraction * peaks.length);
      const visibleCount = Math.ceil(visibleFraction * peaks.length);
      const peaksPerPixel = visibleCount / width;

      ctx.fillStyle = fillStyle;
      for (let x = 0; x < width; x++) {
        const s = startIdx + Math.floor(x * peaksPerPixel);
        const e = startIdx + Math.floor((x + 1) * peaksPerPixel);
        let maxPeak = 0;
        for (let i = s; i < e && i < peaks.length; i++) {
          if (peaks[i]! > maxPeak) maxPeak = peaks[i]!;
        }
        const barHeight = Math.max(1, maxPeak * (height - 4));
        const y = centerY - barHeight / 2;
        ctx.fillRect(x, y, 1, barHeight);
      }
    };

    // Draw previous waveform (red)
    drawWaveform(previousWaveform, 'rgba(239, 68, 68, 0.5)');
    // Draw current waveform (green)
    drawWaveform(currentWaveform, 'rgba(34, 197, 94, 0.5)');

    // Draw playhead
    if (duration > 0) {
      const timeFraction = currentTime / duration;
      if (timeFraction >= startFraction && timeFraction <= startFraction + visibleFraction) {
        const playheadX = ((timeFraction - startFraction) / visibleFraction) * width;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
    }
  }, [currentWaveform, previousWaveform, currentTime, duration, containerWidth, zoom, scrollOffset]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xFraction = (e.clientX - rect.left) / rect.width;
      const visibleFraction = 1 / zoom;
      const absoluteFraction = scrollOffset + xFraction * visibleFraction;
      onSeek(absoluteFraction * duration);
    },
    [onSeek, duration, zoom, scrollOffset]
  );

  // Wheel zoom/scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = e.currentTarget.getBoundingClientRect();
        const cursorFraction = (e.clientX - rect.left) / rect.width;
        const cursorTime = scrollOffset + cursorFraction / zoom;
        const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(1, Math.min(64, zoom * zoomDelta));
        const newOffset = Math.max(0, Math.min(1 - 1 / newZoom, cursorTime - cursorFraction / newZoom));
        onZoomChange(newZoom);
        onScrollOffsetChange(newOffset);
      } else {
        const scrollDelta = (e.deltaY / containerWidth) * (1 / zoom);
        const newOffset = Math.max(0, Math.min(1 - 1 / zoom, scrollOffset + scrollDelta));
        onScrollOffsetChange(newOffset);
      }
    },
    [zoom, scrollOffset, containerWidth, onZoomChange, onScrollOffsetChange]
  );

  // Middle-click drag to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 && zoom > 1) {
        e.preventDefault();
        isDraggingRef.current = true;
        lastDragXRef.current = e.clientX;
      }
    },
    [zoom]
  );

  useEffect(() => {
    if (zoom <= 1) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastDragXRef.current;
      lastDragXRef.current = e.clientX;
      const scrollDelta = (-dx / containerWidth) * (1 / zoom);
      const newOffset = Math.max(0, Math.min(1 - 1 / zoom, scrollOffset + scrollDelta));
      onScrollOffsetChange(newOffset);
    };
    const handleMouseUp = () => { isDraggingRef.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom, scrollOffset, containerWidth, onScrollOffsetChange]);

  return (
    <div
      ref={containerRef}
      className="flex-1 m-2 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)] p-4"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500/50 rounded" />
            <span className="text-[var(--vscode-descriptionForeground)]">Previous</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500/50 rounded" />
            <span className="text-[var(--vscode-descriptionForeground)]">Current</span>
          </div>
        </div>
        {zoom > 1 && (
          <span className="text-[var(--vscode-descriptionForeground)]">
            {zoom.toFixed(1)}x
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="block cursor-pointer mx-auto"
        style={{ width: containerWidth, height }}
        onClick={handleClick}
      />
      {zoom > 1 && (
        <div className="relative h-2 bg-[var(--vscode-editor-background)] rounded mt-2">
          <div
            className="absolute h-full bg-[var(--vscode-button-background)] rounded opacity-60"
            style={{
              left: `${scrollOffset * 100}%`,
              width: `${(1 / zoom) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Diff Region Overlay (highlights diff regions on waveform)
// =============================================================================

interface DiffRegionOverlayProps {
  regions: Array<{ start: number; end: number }>;
  duration: number;
  width: number;
  height: number;
  zoom?: number;
  scrollOffset?: number;
}

const DiffRegionOverlay = memo(function DiffRegionOverlay({
  regions,
  duration,
  width,
  height,
  zoom = 1,
  scrollOffset = 0,
}: DiffRegionOverlayProps) {
  if (!regions.length || duration <= 0) return null;

  const visibleFraction = 1 / zoom;
  const visibleStart = scrollOffset * duration;
  const visibleEnd = (scrollOffset + visibleFraction) * duration;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {regions.map((region, i) => {
        // Skip regions outside visible range
        if (region.end < visibleStart || region.start > visibleEnd) return null;
        // Clamp to visible range and map to pixel coordinates
        const clampedStart = Math.max(region.start, visibleStart);
        const clampedEnd = Math.min(region.end, visibleEnd);
        const x = ((clampedStart - visibleStart) / (visibleEnd - visibleStart)) * width;
        const w = ((clampedEnd - clampedStart) / (visibleEnd - visibleStart)) * width;
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={Math.max(1, w)}
            height={height}
            fill="rgba(239, 68, 68, 0.15)"
            stroke="rgba(239, 68, 68, 0.3)"
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
});

// =============================================================================
// Three-Track Waveform View (A / B / Diff)
// =============================================================================

interface ThreeTrackWaveformProps {
  currentWaveform: number[];
  previousWaveform: number[];
  currentTime: number;
  duration: number;
  diffRegions?: Array<{ start: number; end: number }>;
  zoom: number;
  scrollOffset: number;
  onZoomChange: (zoom: number) => void;
  onScrollOffsetChange: (offset: number) => void;
  onSeek: (time: number) => void;
}

const ThreeTrackWaveform = memo(function ThreeTrackWaveform({
  currentWaveform,
  previousWaveform,
  currentTime,
  duration,
  diffRegions = [],
  zoom,
  scrollOffset,
  onZoomChange,
  onScrollOffsetChange,
  onSeek,
}: ThreeTrackWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const trackHeight = 80;
  const isDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);

  // Compute diff waveform: |A - B|
  const diffWaveform = useMemo(() => {
    const len = Math.max(currentWaveform.length, previousWaveform.length);
    const diff = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      const a = previousWaveform[i] ?? 0;
      const b = currentWaveform[i] ?? 0;
      diff[i] = Math.abs(a - b);
    }
    return diff;
  }, [currentWaveform, previousWaveform]);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wheel zoom: Ctrl+wheel = zoom, plain wheel = scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom centered on cursor position
        const rect = e.currentTarget.getBoundingClientRect();
        const cursorFraction = (e.clientX - rect.left) / rect.width;
        const cursorTime = scrollOffset + cursorFraction / zoom;

        const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(1, Math.min(64, zoom * zoomDelta));
        // Adjust scroll to keep cursor position stable
        const newOffset = Math.max(0, Math.min(1 - 1 / newZoom, cursorTime - cursorFraction / newZoom));
        onZoomChange(newZoom);
        onScrollOffsetChange(newOffset);
      } else {
        // Horizontal scroll
        const scrollDelta = (e.deltaY / containerWidth) * (1 / zoom);
        const newOffset = Math.max(0, Math.min(1 - 1 / zoom, scrollOffset + scrollDelta));
        onScrollOffsetChange(newOffset);
      }
    },
    [zoom, scrollOffset, containerWidth, onZoomChange, onScrollOffsetChange]
  );

  // Middle-click drag to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 && zoom > 1) {
        e.preventDefault();
        isDraggingRef.current = true;
        lastDragXRef.current = e.clientX;
      }
    },
    [zoom]
  );

  useEffect(() => {
    if (zoom <= 1) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastDragXRef.current;
      lastDragXRef.current = e.clientX;
      const scrollDelta = (-dx / containerWidth) * (1 / zoom);
      const newOffset = Math.max(0, Math.min(1 - 1 / zoom, scrollOffset + scrollDelta));
      onScrollOffsetChange(newOffset);
    };
    const handleMouseUp = () => { isDraggingRef.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom, scrollOffset, containerWidth, onScrollOffsetChange]);

  const tracks = [
    { label: 'A (Previous)', peaks: previousWaveform, color: '#ef4444' },
    { label: 'B (Current)', peaks: currentWaveform, color: '#22c55e' },
    { label: 'Diff |A-B|', peaks: diffWaveform, color: '#eab308' },
  ];

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-2 space-y-1"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      {/* Zoom indicator */}
      {zoom > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--vscode-descriptionForeground)] px-1 mb-1">
          <span>Zoom: {zoom.toFixed(1)}x</span>
          <span>
            {duration > 0
              ? `${(scrollOffset * duration).toFixed(1)}s – ${((scrollOffset + 1 / zoom) * duration).toFixed(1)}s`
              : ''}
          </span>
          <span className="opacity-60">Ctrl+Wheel: zoom · Wheel: scroll</span>
        </div>
      )}
      {tracks.map((track) => (
        <div key={track.label} className="relative">
          <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-0.5 flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: track.color }}
            />
            {track.label}
          </div>
          <div className="relative bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)]">
            {track.label.startsWith('Diff') && (
              <DiffRegionOverlay
                regions={diffRegions}
                duration={duration}
                width={containerWidth}
                height={trackHeight}
                zoom={zoom}
                scrollOffset={scrollOffset}
              />
            )}
            <WaveformCanvas
              peaks={track.peaks}
              width={containerWidth}
              height={trackHeight}
              color={track.color}
              currentTime={currentTime}
              duration={duration}
              zoom={zoom}
              scrollOffset={scrollOffset}
              onSeek={onSeek}
            />
          </div>
        </div>
      ))}
      {/* Minimap scrollbar when zoomed */}
      {zoom > 1 && (
        <div className="relative h-2 bg-[var(--vscode-input-background)] rounded mt-1 mx-1">
          <div
            className="absolute h-full bg-[var(--vscode-button-background)] rounded opacity-60"
            style={{
              left: `${scrollOffset * 100}%`,
              width: `${(1 / zoom) * 100}%`,
            }}
          />
        </div>
      )}
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

  useEffect(() => {
    const current = currentAudioRef.current;
    if (!current) return;
    const handleTimeUpdate = () => {
      onTimeChange(current.currentTime);
    };
    current.addEventListener('timeupdate', handleTimeUpdate);
    return () => current.removeEventListener('timeupdate', handleTimeUpdate);
  }, [onTimeChange]);

  useEffect(() => {
    const current = currentAudioRef.current;
    const previous = previousAudioRef.current;
    if (current) current.muted = playingVersion === 'previous';
    if (previous) previous.muted = playingVersion === 'current';
  }, [playingVersion]);

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <audio ref={currentAudioRef} src={currentSrc} />
      <audio ref={previousAudioRef} src={previousSrc} />

      <button
        type="button"
        className="w-8 h-8 flex items-center justify-center bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={handlePlayPause}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

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

      <span className="text-xs text-[var(--vscode-foreground)] font-mono min-w-[100px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

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
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Duration</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{formatDuration(details.duration.previous)}</span>
            <span>→</span>
            <span className="text-green-400">{formatDuration(details.duration.current)}</span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Sample Rate</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.sampleRate.previous} Hz</span>
            <span>→</span>
            <span className="text-green-400">{details.sampleRate.current} Hz</span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">Channels</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {details.channels.previous === 1 ? 'Mono' : details.channels.previous === 2 ? 'Stereo' : `${details.channels.previous}ch`}
            </span>
            <span>→</span>
            <span className="text-green-400">
              {details.channels.current === 1 ? 'Mono' : details.channels.current === 2 ? 'Stereo' : `${details.channels.current}ch`}
            </span>
          </div>
        </div>
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
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);

  const duration = Math.max(
    details?.duration.current ?? 0,
    details?.duration.previous ?? 0
  );

  const handleTimeChange = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange]
  );

  const handlePlayingVersionChange = useCallback(
    (version: 'current' | 'previous' | 'both') => {
      setLocalPlayingVersion(version);
      onPlayingVersionChange?.(version);
    },
    [onPlayingVersionChange]
  );

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const handleScrollOffsetChange = useCallback((offset: number) => {
    setScrollOffset(offset);
  }, []);

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
            Loading audio files...
          </div>
        </div>
      </div>
    );
  }

  const displayCurrentWaveform = currentWaveform.length > 0 ? currentWaveform : Array(100).fill(0.5).map(() => Math.random());
  const displayPreviousWaveform = previousWaveform.length > 0 ? previousWaveform : Array(100).fill(0.5).map(() => Math.random());

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {viewMode === 'side-by-side' && (
        <ThreeTrackWaveform
          currentWaveform={displayCurrentWaveform}
          previousWaveform={displayPreviousWaveform}
          currentTime={localTime}
          duration={duration}
          diffRegions={details?.diffRegions}
          zoom={zoom}
          scrollOffset={scrollOffset}
          onZoomChange={handleZoomChange}
          onScrollOffsetChange={handleScrollOffsetChange}
          onSeek={handleTimeChange}
        />
      )}
      {(viewMode === 'overlay' || viewMode === 'slider' || viewMode === 'onion-skin') && (
        <OverlayWaveform
          currentWaveform={displayCurrentWaveform}
          previousWaveform={displayPreviousWaveform}
          currentTime={localTime}
          duration={duration}
          zoom={zoom}
          scrollOffset={scrollOffset}
          onZoomChange={handleZoomChange}
          onScrollOffsetChange={handleScrollOffsetChange}
          onSeek={handleTimeChange}
        />
      )}
      <AudioPlayerControls
        currentSrc={currentSrc}
        previousSrc={previousSrc}
        currentTime={localTime}
        duration={duration}
        playingVersion={localPlayingVersion}
        onPlayingVersionChange={handlePlayingVersionChange}
        onTimeChange={handleTimeChange}
      />
      <AudioDetails details={details} />
    </div>
  );
});

export default AudioDiffViewer;
