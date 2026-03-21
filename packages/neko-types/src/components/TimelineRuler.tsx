/**
 * TimelineRuler — Shared time ruler for timeline editors.
 *
 * Renders major/minor tick marks and time labels on a canvas element.
 * Algorithm merges the best practices from neko-cut and neko-audio implementations.
 *
 * CSS class `.neko-ruler` is injected by the Tailwind preset plugin.
 */

import React, { useCallback, useEffect, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimelineRulerProps {
  duration: number;
  /** Pixels per second. Both packages pass: 50 * zoomLevel */
  pixelsPerSecond: number;
  onSeek: (time: number) => void;
  /** Height in pixels. Default: 24 */
  height?: number;
  /**
   * When provided, the ruler canvas width is kept in sync with
   * the container's scrollLeft so labels follow the scroll position.
   */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

// ── Tick interval calculation ─────────────────────────────────────────────────

interface TickConfig {
  interval: number;   // seconds between minor ticks
  majorEvery: number; // every Nth minor tick is a major tick
}

function calcTickConfig(pps: number): TickConfig {
  if (pps >= 200) return { interval: 0.5, majorEvery: 10 };
  if (pps >= 100) return { interval: 1,   majorEvery: 5  };
  if (pps >= 50)  return { interval: 2,   majorEvery: 5  };
  if (pps >= 25)  return { interval: 5,   majorEvery: 4  };
  if (pps >= 10)  return { interval: 10,  majorEvery: 3  };
  return               { interval: 30,  majorEvery: 1  };
}

function formatRulerTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineRuler({
  duration,
  pixelsPerSecond,
  onSeek,
  height = 24,
  scrollRef,
  className,
}: TimelineRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = container.clientWidth;
    const totalWidth = Math.max(containerWidth, Math.ceil(duration * pixelsPerSecond) + 40);

    // Resize canvas if needed
    if (canvas.width !== totalWidth * dpr || canvas.height !== height * dpr) {
      canvas.width = totalWidth * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${totalWidth}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read CSS variables for theming
    const style = getComputedStyle(document.documentElement);
    const fg = style.getPropertyValue('--neko-fg-secondary').trim() || '#8e8e93';
    const divider = style.getPropertyValue('--neko-divider').trim() || 'rgba(255,255,255,0.06)';
    const surface = style.getPropertyValue('--neko-surface').trim() || '#242426';

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, height);

    // Background
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, totalWidth, height);

    // Bottom border
    ctx.fillStyle = divider;
    ctx.fillRect(0, height - 1, totalWidth, 1);

    // Ticks
    const { interval, majorEvery } = calcTickConfig(pixelsPerSecond);
    const totalTicks = Math.ceil(duration / interval) + 1;

    ctx.fillStyle = fg;
    ctx.font = `10px var(--vscode-font-family, system-ui, sans-serif)`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < totalTicks; i++) {
      const t = i * interval;
      if (t > duration + interval) break;

      const x = t * pixelsPerSecond;
      const isMajor = i % majorEvery === 0;
      const tickH = isMajor ? 10 : 5;

      ctx.fillStyle = fg;
      ctx.fillRect(x, height - tickH - 1, 1, tickH);

      if (isMajor && x >= 0) {
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.7;
        ctx.fillText(formatRulerTime(t), x + 3, 3);
        ctx.globalAlpha = 1;
      }
    }
  }, [duration, pixelsPerSecond, height]);

  // Redraw whenever props change
  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scrollLeft = scrollRef?.current?.scrollLeft ?? 0;
      const x = e.clientX - rect.left + scrollLeft;
      const time = Math.max(0, Math.min(duration, x / pixelsPerSecond));
      onSeek(time);
    },
    [duration, pixelsPerSecond, onSeek, scrollRef],
  );

  return (
    <div
      ref={containerRef}
      className={`neko-ruler${className ? ` ${className}` : ''}`}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        onPointerDown={handlePointerDown}
      />
    </div>
  );
}
