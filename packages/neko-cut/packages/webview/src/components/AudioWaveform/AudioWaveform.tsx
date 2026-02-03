/**
 * AudioWaveform Component
 * 音频波形组件 - 在时间轴上显示音频波形
 */

import { memo, useEffect, useRef, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface WaveformData {
  /** Normalized peaks array (0-1) */
  peaks: number[];
  /** Duration in seconds */
  duration: number;
  /** Sample rate used for analysis */
  sampleRate: number;
}

interface AudioWaveformProps {
  /** Waveform data (pre-computed peaks) */
  waveformData: WaveformData | null;
  /** Width of the waveform container in pixels */
  width: number;
  /** Height of the waveform container in pixels */
  height: number;
  /** Start time offset for trimmed clips (seconds) */
  trimStart?: number;
  /** End time offset for trimmed clips (seconds) */
  trimEnd?: number;
  /** Current volume (0-2, affects visual intensity) */
  volume?: number;
  /** Whether audio is muted (dims the waveform) */
  muted?: boolean;
  /** Waveform color */
  color?: string;
  /** Background color */
  backgroundColor?: string;
  /** Whether to show a centerline */
  showCenterline?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate waveform data from audio buffer
 * 从音频缓冲区生成波形数据
 */
export async function generateWaveformData(
  audioBuffer: AudioBuffer,
  samplesPerPeak: number = 512
): Promise<WaveformData> {
  const channelData = audioBuffer.getChannelData(0); // Use first channel
  const peaks: number[] = [];

  for (let i = 0; i < channelData.length; i += samplesPerPeak) {
    let min = 0;
    let max = 0;

    for (let j = 0; j < samplesPerPeak && i + j < channelData.length; j++) {
      const sample = channelData[i + j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    // Store the amplitude (absolute max of min/max)
    peaks.push(Math.max(Math.abs(min), Math.abs(max)));
  }

  return {
    peaks,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
  };
}

/**
 * Analyze audio file and return waveform data
 * 分析音频文件并返回波形数据
 */
export async function analyzeAudioFile(
  file: File | Blob,
  samplesPerPeak: number = 512
): Promise<WaveformData> {
  const audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const waveformData = await generateWaveformData(audioBuffer, samplesPerPeak);
  await audioContext.close();
  return waveformData;
}

// =============================================================================
// Canvas Drawing Function
// =============================================================================

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  width: number,
  height: number,
  color: string,
  volume: number = 1,
  showCenterline: boolean = false
) {
  const centerY = height / 2;
  const peaksPerPixel = peaks.length / width;

  ctx.clearRect(0, 0, width, height);

  // Draw centerline if enabled
  if (showCenterline) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Draw waveform
  ctx.fillStyle = color;

  for (let x = 0; x < width; x++) {
    const startPeak = Math.floor(x * peaksPerPixel);
    const endPeak = Math.floor((x + 1) * peaksPerPixel);

    // Find max peak in this pixel range
    let maxPeak = 0;
    for (let i = startPeak; i < endPeak && i < peaks.length; i++) {
      if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }

    // Apply volume scaling (capped at 1 for visual purposes)
    const scaledPeak = Math.min(maxPeak * volume, 1);
    const barHeight = scaledPeak * (height - 4); // Leave 2px padding top/bottom

    // Draw symmetric bar
    const y = centerY - barHeight / 2;
    ctx.fillRect(x, y, 1, barHeight);
  }
}

// =============================================================================
// Main AudioWaveform Component
// =============================================================================

export const AudioWaveform = memo(function AudioWaveform({
  waveformData,
  width,
  height,
  trimStart = 0,
  trimEnd,
  volume = 1,
  muted = false,
  color = 'var(--vscode-charts-green)',
  backgroundColor = 'transparent',
  showCenterline = false,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Calculate which peaks to display based on trim
  const visiblePeaks = useMemo(() => {
    if (!waveformData) return [];

    const { peaks, duration } = waveformData;
    const effectiveTrimEnd = trimEnd ?? duration;

    // Calculate start and end indices
    const startRatio = trimStart / duration;
    const endRatio = effectiveTrimEnd / duration;

    const startIndex = Math.floor(startRatio * peaks.length);
    const endIndex = Math.ceil(endRatio * peaks.length);

    return peaks.slice(startIndex, endIndex);
  }, [waveformData, trimStart, trimEnd]);

  // Draw the waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visiblePeaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution for retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Get computed color if using CSS variable
    let resolvedColor = color;
    if (color.startsWith('var(')) {
      const temp = document.createElement('div');
      temp.style.color = color;
      document.body.appendChild(temp);
      resolvedColor = getComputedStyle(temp).color;
      document.body.removeChild(temp);
    }

    drawWaveform(
      ctx,
      visiblePeaks,
      width,
      height,
      resolvedColor,
      muted ? 0.3 : volume,
      showCenterline
    );
  }, [visiblePeaks, width, height, color, volume, muted, showCenterline]);

  // Empty state
  if (!waveformData || visiblePeaks.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height, backgroundColor }}
      >
        <div className="w-full h-[2px] bg-current opacity-20" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`block ${muted ? 'opacity-50' : ''}`}
      style={{
        width,
        height,
        backgroundColor,
      }}
    />
  );
});

// =============================================================================
// AudioWaveformPlaceholder Component (for loading state)
// =============================================================================

interface AudioWaveformPlaceholderProps {
  width: number;
  height: number;
}

export const AudioWaveformPlaceholder = memo(function AudioWaveformPlaceholder({
  width,
  height,
}: AudioWaveformPlaceholderProps) {
  return (
    <div
      className="flex items-center justify-center bg-[var(--vscode-input-background)]"
      style={{ width, height }}
    >
      <div className="flex items-center gap-1">
        {/* Simple loading animation bars */}
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="w-0.5 bg-[var(--vscode-descriptionForeground)] animate-pulse"
            style={{
              height: `${20 + Math.random() * 60}%`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
});

export default AudioWaveform;
