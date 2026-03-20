/**
 * SpectrumAnalyzer - Real-time frequency visualization
 *
 * Renders FFT frequency data as a bar chart using Canvas 2D.
 * Connected to AudioStreamClient's AnalyserNode via useSpectrum hook.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { AudioStreamClient } from '@neko/neko-client';
import { useSpectrum } from '../hooks/useSpectrum';

// Colors
const BAR_COLOR_LOW = '#4a9eff'; // Bass (0-200Hz)
const BAR_COLOR_MID = '#00cc88'; // Mids (200-2kHz)
const BAR_COLOR_HIGH = '#ff6b6b'; // Highs (2kHz+)
const BG_COLOR = 'rgba(0, 0, 0, 0.3)';

interface SpectrumAnalyzerProps {
  audioClientRef: React.RefObject<AudioStreamClient | null>;
  enabled: boolean;
}

export function SpectrumAnalyzer({ audioClientRef, enabled }: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logicalSizeRef = useRef({ width: 0, height: 0 });

  const { frequencyData, binCount } = useSpectrum(audioClientRef, enabled);

  // =========================================================================
  // Drawing
  // =========================================================================

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = logicalSizeRef.current;
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    if (!frequencyData || frequencyData.length === 0) {
      // No data — draw empty state
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.font = '11px var(--vscode-font-family, sans-serif)';
      ctx.textAlign = 'center';
      ctx.fillText('No spectrum data', width / 2, height / 2);
      return;
    }

    const barCount = Math.min(binCount, 64); // Limit bars for readability
    const barWidth = width / barCount;
    const barGap = 1;

    // Frequency boundaries for coloring (approximate bin indices)
    const lowEnd = Math.floor(barCount * 0.15); // ~200Hz
    const midEnd = Math.floor(barCount * 0.5); // ~2kHz

    for (let i = 0; i < barCount; i++) {
      // Map to frequency data (logarithmic would be better, but linear is simpler)
      const dataIndex = Math.floor((i / barCount) * frequencyData.length);
      const value = frequencyData[dataIndex] ?? 0;
      const barHeight = (value / 255) * height;

      // Color by frequency range
      if (i < lowEnd) {
        ctx.fillStyle = BAR_COLOR_LOW;
      } else if (i < midEnd) {
        ctx.fillStyle = BAR_COLOR_MID;
      } else {
        ctx.fillStyle = BAR_COLOR_HIGH;
      }

      const x = i * barWidth;
      ctx.fillRect(x + barGap / 2, height - barHeight, barWidth - barGap, barHeight);
    }
  }, [frequencyData, binCount]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  // =========================================================================
  // Resize handling
  // =========================================================================

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;

        logicalSizeRef.current = { width, height };
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);

        drawRef.current();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw on data changes
  useEffect(() => {
    draw();
  }, [draw]);

  // =========================================================================
  // Render
  // =========================================================================

  if (!enabled) return null;

  return (
    <div ref={containerRef} className="w-full h-20 relative overflow-hidden rounded shrink-0">
      <canvas ref={canvasRef} className="absolute top-0 left-0" />
    </div>
  );
}
