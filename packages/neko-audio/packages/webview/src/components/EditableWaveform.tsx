/**
 * EditableWaveform - Waveform visualization with selection support
 *
 * Based on neko-preview WaveformCanvas, enhanced with:
 * - Drag-to-select region
 * - Selection highlight overlay
 * - Silence region visualization
 * - Click to seek (outside selection drag)
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { PositionedContextMenu as ContextMenu, type MenuItem } from '@neko/ui/primitives';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

/** Read CSS custom properties at draw-time so canvas follows theme */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface EditableWaveformProps {
  onSeek: (time: number) => void;
}

export function EditableWaveform({ onSeek }: EditableWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logicalSizeRef = useRef({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);

  const { waveform, currentTime, selection, silenceRegions, setSelection } = useAudioStore();
  const duration = waveform?.duration ?? 0;
  const peaks = waveform?.peaks ?? null;

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

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
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = getCssVar('--waveform-bg');
    ctx.fillRect(0, 0, width, height);

    // Draw silence regions
    if (silenceRegions.length > 0 && duration > 0) {
      ctx.fillStyle = getCssVar('--waveform-silence');
      for (const region of silenceRegions) {
        const x1 = (region.start / duration) * width;
        const x2 = (region.end / duration) * width;
        ctx.fillRect(x1, 0, x2 - x1, height);
      }
    }

    // Draw selection
    if (selection && duration > 0) {
      const selX1 = (selection.start / duration) * width;
      const selX2 = (selection.end / duration) * width;

      ctx.fillStyle = getCssVar('--selection-bg');
      ctx.fillRect(selX1, 0, selX2 - selX1, height);

      ctx.strokeStyle = getCssVar('--selection-border');
      ctx.lineWidth = 1;
      ctx.strokeRect(selX1, 0, selX2 - selX1, height);
    }

    if (!peaks || peaks.length === 0) {
      // No data — draw center line
      ctx.strokeStyle = getCssVar('--waveform-centerline');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      return;
    }

    // Progress position
    const progressX = duration > 0 ? (currentTime / duration) * width : 0;

    // Draw waveform bars
    const barWidth = Math.max(1, width / peaks.length);
    const halfHeight = height * 0.4;

    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const peakValue = Math.abs(peaks[i] ?? 0);
      const barHeight = Math.max(1, peakValue * halfHeight);

      ctx.fillStyle =
        x < progressX ? getCssVar('--waveform-played') : getCssVar('--waveform-unplayed');
      ctx.fillRect(x, centerY - barHeight, barWidth - 0.5, barHeight * 2);
    }

    // Draw playback cursor
    if (duration > 0) {
      ctx.fillStyle = getCssVar('--waveform-cursor');
      ctx.fillRect(progressX - 1, 0, 2, height);
    }
  }, [peaks, duration, currentTime, selection, silenceRegions]);

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
        if (ctx) {
          ctx.scale(dpr, dpr);
        }

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
  // Mouse interaction
  // =========================================================================

  const getTimeFromEvent = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas || duration <= 0) return 0;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items: MenuItem[] = [
        {
          label: t('audio.edit.trim'),
          disabled: !selection,
          onClick: () => {
            if (selection) {
              postMessage({
                type: 'audio:trim',
                startTime: selection.start,
                endTime: selection.end,
                mode: 'single-file',
              });
            }
          },
        },
        { separator: true },
        {
          label: t('audio.edit.selectAll'),
          shortcut: '⌘A',
          onClick: () => setSelection({ start: 0, end: duration }),
        },
        {
          label: t('audio.edit.clearSelection'),
          disabled: !selection,
          onClick: () => setSelection(null),
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [selection, duration, setSelection],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Left click only
      const time = getTimeFromEvent(e.clientX);

      if (e.shiftKey) {
        // Shift+click: extend selection
        if (selection) {
          const midpoint = (selection.start + selection.end) / 2;
          if (time < midpoint) {
            setSelection({ start: time, end: selection.end });
          } else {
            setSelection({ start: selection.start, end: time });
          }
        } else {
          setSelection({ start: Math.min(currentTime, time), end: Math.max(currentTime, time) });
        }
        return;
      }

      // Start drag for selection
      dragStartRef.current = time;
      setIsDragging(true);
      setSelection(null);

      const handleMouseMove = (ev: MouseEvent) => {
        const moveTime = getTimeFromEvent(ev.clientX);
        const start = dragStartRef.current ?? 0;
        const selStart = Math.min(start, moveTime);
        const selEnd = Math.max(start, moveTime);

        // Only create selection if drag distance is meaningful (>0.1s)
        if (selEnd - selStart > 0.1) {
          setSelection({ start: selStart, end: selEnd });
        }
      };

      const handleMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        setIsDragging(false);

        const endTime = getTimeFromEvent(ev.clientX);
        const start = dragStartRef.current ?? 0;

        // If very short drag, treat as click-to-seek
        if (Math.abs(endTime - start) < 0.1) {
          setSelection(null);
          onSeek(endTime);
        }

        dragStartRef.current = null;
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [duration, currentTime, selection, getTimeFromEvent, onSeek, setSelection],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ cursor: isDragging ? 'col-resize' : 'crosshair' }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0" />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
