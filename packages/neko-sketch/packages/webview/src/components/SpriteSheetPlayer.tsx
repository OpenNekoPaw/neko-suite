/**
 * SpriteSheetPlayer - sprite sheet import and animation preview
 *
 * Workflow:
 *   1. User selects a PNG sprite sheet (and optional JSON metadata file).
 *   2. Frames are sliced using the JSON frame map, or a user-specified grid.
 *   3. Frames are displayed in a scrollable grid with play/pause/seek controls.
 *   4. Playback cycles through frames at the configured FPS.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ImportedFrame } from '../utils/spritesheet-import';
import { importSpriteSheet } from '../utils/spritesheet-import';
import { useTranslation } from '../i18n/I18nContext';

interface PlaybackState {
  playing: boolean;
  fps: number;
  currentIndex: number;
}

/** Draw an ImportedFrame's ImageData onto a canvas element. */
function drawFrameOnCanvas(canvas: HTMLCanvasElement, frame: ImportedFrame): void {
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(frame.imageData, 0, 0);
}

export function SpriteSheetPlayer() {
  const { t } = useTranslation();

  const [frames, setFrames] = useState<ImportedFrame[]>([]);
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [playback, setPlayback] = useState<PlaybackState>({
    playing: false,
    fps: 12,
    currentIndex: 0,
  });

  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Draw current frame on the preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const frame = frames[playback.currentIndex];
    if (canvas && frame) {
      drawFrameOnCanvas(canvas, frame);
    }
  }, [frames, playback.currentIndex]);

  // Playback RAF loop
  useEffect(() => {
    if (!playback.playing || frames.length === 0) return;

    const interval = 1000 / playback.fps;
    let running = true;

    const loop = (now: number) => {
      if (!running) return;
      if (now - lastTickRef.current >= interval) {
        lastTickRef.current = now;
        setPlayback((prev) => ({
          ...prev,
          currentIndex: (prev.currentIndex + 1) % frames.length,
        }));
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [playback.playing, playback.fps, frames.length]);

  // Handle image file selection — parse immediately after both files are ready
  const handleImageFile = useCallback(
    async (imageFile: File, metaFile: File | null) => {
      setError(null);
      try {
        const imported = await importSpriteSheet(imageFile, metaFile, { cols, rows });
        if (imported.length === 0) throw new Error(t('sketch.spritesheet.noFrames'));
        setFrames(imported);
        setPlayback((prev) => ({ ...prev, currentIndex: 0, playing: false }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [cols, rows, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      const imgFile = files.find((f) => f.type === 'image/png');
      const jsonFile = files.find((f) => f.type === 'application/json' || f.name.endsWith('.json'));
      if (imgFile) void handleImageFile(imgFile, jsonFile ?? null);
    },
    [handleImageFile],
  );

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.spritesheet')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.spritesheet')}</h3>

      {/* Grid controls for uniform-grid import (shown only before import) */}
      {frames.length === 0 && (
        <div className="text-[10px] mb-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <span className="w-8 opacity-60">{t('sketch.spritesheet.cols')}</span>
            <input
              type="number"
              min={1}
              max={64}
              value={cols}
              onChange={(e) => setCols(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-12 text-xs text-center bg-transparent border border-[var(--vscode-input-border)] rounded px-1"
              aria-label={t('sketch.spritesheet.colsLabel')}
            />
            <span className="w-6 opacity-60 text-center">×</span>
            <span className="w-8 opacity-60">{t('sketch.spritesheet.rows')}</span>
            <input
              type="number"
              min={1}
              max={64}
              value={rows}
              onChange={(e) => setRows(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-12 text-xs text-center bg-transparent border border-[var(--vscode-input-border)] rounded px-1"
              aria-label={t('sketch.spritesheet.rowsLabel')}
            />
          </div>
        </div>
      )}

      {/* Drop zone / file input */}
      <div
        className="border border-dashed border-[var(--vscode-input-border)] rounded p-2 text-center text-[10px] opacity-60 cursor-pointer hover:opacity-100 mb-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,application/json,.json';
          input.multiple = true;
          input.onchange = () => {
            const files = [...(input.files ?? [])];
            const imgFile = files.find((f) => f.type === 'image/png');
            const jsonFile = files.find(
              (f) => f.type === 'application/json' || f.name.endsWith('.json'),
            );
            if (imgFile) void handleImageFile(imgFile, jsonFile ?? null);
          };
          input.click();
        }}
        aria-label={t('sketch.spritesheet.importLabel')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.click();
        }}
      >
        {frames.length === 0 ? t('sketch.spritesheet.dropHint') : t('sketch.spritesheet.reimport')}
      </div>

      {error && <p className="text-red-400 text-[10px] m-0 mb-1">{error}</p>}

      {/* Preview + playback controls */}
      {frames.length > 0 && (
        <>
          {/* Preview canvas */}
          <div className="flex justify-center mb-1 bg-[var(--vscode-editor-background)] rounded overflow-hidden">
            <canvas
              ref={previewCanvasRef}
              className="max-w-full"
              style={{ imageRendering: 'pixelated', maxHeight: 80 }}
              aria-label={t('sketch.spritesheet.preview')}
            />
          </div>

          {/* Frame counter */}
          <p className="text-[10px] text-center opacity-50 m-0 mb-1">
            {playback.currentIndex + 1} / {frames.length}
          </p>

          {/* Seek slider */}
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={playback.currentIndex}
            onChange={(e) =>
              setPlayback((prev) => ({
                ...prev,
                currentIndex: parseInt(e.target.value, 10),
                playing: false,
              }))
            }
            className="w-full h-2 mb-1"
            aria-label={t('sketch.spritesheet.seek')}
          />

          {/* FPS + Play/Stop */}
          <div className="flex items-center gap-1 text-[10px]">
            <span className="opacity-60">{t('sketch.spritesheet.fps')}</span>
            <input
              type="number"
              min={1}
              max={60}
              value={playback.fps}
              onChange={(e) =>
                setPlayback((prev) => ({
                  ...prev,
                  fps: Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 12)),
                }))
              }
              className="w-10 text-xs text-center bg-transparent border border-[var(--vscode-input-border)] rounded px-1"
              aria-label={t('sketch.spritesheet.fpsLabel')}
            />
            <button
              className="flex-1 text-xs py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
              onClick={() => setPlayback((prev) => ({ ...prev, playing: !prev.playing }))}
              aria-label={
                playback.playing ? t('sketch.spritesheet.stop') : t('sketch.spritesheet.play')
              }
            >
              {playback.playing ? '■' : '▶'}
            </button>
          </div>

          {/* Frame grid thumbnail strip */}
          <div
            className="flex flex-wrap gap-0.5 mt-1 max-h-20 overflow-y-auto"
            role="list"
            aria-label={t('sketch.spritesheet.frameList')}
          >
            {frames.map((frame, idx) => (
              <FrameThumbnail
                key={frame.key}
                frame={frame}
                active={idx === playback.currentIndex}
                onClick={() =>
                  setPlayback((prev) => ({ ...prev, currentIndex: idx, playing: false }))
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Frame Thumbnail ───────────────────────────────────────────────────────────

interface FrameThumbnailProps {
  frame: ImportedFrame;
  active: boolean;
  onClick: () => void;
}

function FrameThumbnail({ frame, active, onClick }: FrameThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawFrameOnCanvas(canvas, frame);
  }, [frame]);

  return (
    <button
      className={`border rounded overflow-hidden p-0 ${
        active
          ? 'border-[var(--vscode-focusBorder)]'
          : 'border-[var(--vscode-input-border)] opacity-60 hover:opacity-100'
      }`}
      onClick={onClick}
      role="listitem"
      aria-label={frame.key}
      aria-pressed={active}
    >
      <canvas
        ref={canvasRef}
        style={{ width: 20, height: 20, imageRendering: 'pixelated', display: 'block' }}
      />
    </button>
  );
}
