/**
 * SpectrumAnalyzer - Real-time frequency visualization
 *
 * Renders FFT frequency data as a bar chart using Canvas 2D.
 * Connected to AudioStreamClient's AnalyserNode via useSpectrum hook.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { AudioStreamClient } from '@neko/neko-client';
import { useSpectrum } from '../hooks/useSpectrum';
import { t } from '../i18n';

/** Read CSS custom properties at draw-time so canvas follows theme */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface SpectrumAnalyzerProps {
  audioClientRef: React.RefObject<AudioStreamClient | null>;
  enabled: boolean;
}

export function SpectrumAnalyzer({ audioClientRef, enabled }: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logicalSizeRef = useRef({ width: 0, height: 0 });

  const { analyserRef, binCount } = useSpectrum(audioClientRef, enabled);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const drawFrameRef = useRef(0);

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
    ctx.fillStyle = getCssVar('--spectrum-bg');
    ctx.fillRect(0, 0, width, height);

    const analyser = analyserRef.current;
    if (analyser && frequencyDataRef.current?.length !== analyser.frequencyBinCount) {
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    const frequencyData = frequencyDataRef.current;
    if (analyser && frequencyData) {
      analyser.getByteFrequencyData(frequencyData);
    }
    if (!frequencyData || frequencyData.length === 0) {
      // No data — draw empty state
      ctx.fillStyle = getCssVar('--spectrum-empty');
      ctx.font = '11px var(--vscode-font-family, sans-serif)';
      ctx.textAlign = 'center';
      ctx.fillText(t('audio.spectrum.noData'), width / 2, height / 2);
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
        ctx.fillStyle = getCssVar('--spectrum-low');
      } else if (i < midEnd) {
        ctx.fillStyle = getCssVar('--spectrum-mid');
      } else {
        ctx.fillStyle = getCssVar('--spectrum-high');
      }

      const x = i * barWidth;
      ctx.fillRect(x + barGap / 2, height - barHeight, barWidth - barGap, barHeight);
    }
  }, [analyserRef, binCount]);

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
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        drawRef.current();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw from the analyser buffer without React state churn.
  useEffect(() => {
    if (!enabled) {
      draw();
      return;
    }

    const render = () => {
      draw();
      drawFrameRef.current = requestAnimationFrame(render);
    };
    drawFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (drawFrameRef.current) {
        cancelAnimationFrame(drawFrameRef.current);
      }
    };
  }, [draw, enabled]);

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
