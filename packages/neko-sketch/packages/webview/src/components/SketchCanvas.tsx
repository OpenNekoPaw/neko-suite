/**
 * SketchCanvas - WebGL canvas with renderer integration
 *
 * Initializes the WebGL renderer, handles resize, and
 * connects pointer input to the brush engine, pixel tool, and vector tool.
 *
 * Frame mode integration:
 *   - On currentFrameIndex change: save outgoing frame pixels, load incoming frame pixels.
 *   - Onion skin overlay rendered via a 2D canvas positioned over the WebGL canvas.
 *
 * Filter / particle integration:
 *   - Render loop uses renderWithEffects() to apply the filter chain and particle overlay.
 */
import { useRef, useEffect, useCallback } from 'react';
import { useSketchStore } from '../stores';
import { SketchRenderer } from '../engine';
import { BrushEngine } from '../brush';
import { usePointerInput } from '../hooks/usePointerInput';
import type { StrokePoint } from '../types';
import type { OnionSkinGhost } from '../types/frame';
import type { ViewportState } from '../types';
import { drawPixel, drawLine } from '../tools/pixel-tool';
import type { PixelBrushSize } from '../tools/pixel-tool';
import { createRectangle, createEllipse } from '../tools/vector-tool';
import { renderPaths } from '../engine/vector-renderer';
import { computeOnionSkinGhosts } from '../utils/frame-manager';

// ─── Helpers ───

/** Convert screen coordinates to canvas coordinates accounting for viewport. */
function screenToCanvas(
  screenX: number,
  screenY: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  return {
    x: screenX / zoom - panX / zoom,
    y: screenY / zoom - panY / zoom,
  };
}

/** Clamp and snap brush size to a valid PixelBrushSize. */
function toPixelBrushSize(size: number): PixelBrushSize {
  const clamped = Math.min(8, Math.max(1, Math.round(size)));
  if (clamped <= 1) return 1;
  if (clamped <= 2) return 2;
  if (clamped <= 4) return 4;
  return 8;
}

/** Parse hex color string to normalized RGBA tuple (0-1 range). */
function hexToRGBA(hex: string): readonly [number, number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a] as const;
}

/** Read pixels from a texture into an ImageData via a temporary framebuffer. */
function readTextureToImageData(
  renderer: SketchRenderer,
  texture: WebGLTexture,
  w: number,
  h: number,
): ImageData {
  const fbo = renderer.textures.createFramebuffer(texture);
  const pixels = renderer.textures.readPixels(fbo, 0, 0, w, h);
  renderer.textures.deleteFramebuffer(fbo);
  const buffer = new ArrayBuffer(pixels.length);
  const clamped = new Uint8ClampedArray(buffer);
  clamped.set(pixels);
  return new ImageData(clamped, w, h);
}

/** Upload pixel data to a WebGL texture. */
function uploadImageDataToTexture(
  renderer: SketchRenderer,
  texture: WebGLTexture,
  imageData: ImageData,
): void {
  renderer.textures.updateTexture(
    texture,
    0,
    0,
    imageData.width,
    imageData.height,
    new Uint8Array(imageData.data.buffer),
  );
}

/**
 * Render onion skin ghosts onto the 2D overlay canvas.
 *
 * The transform matches the WebGL viewport: document pixel (0,0) is placed at
 * physical screen position (phW/2*(1-zoom)+panX, phH/2*(1-zoom)+panY), and each
 * document pixel spans zoom*(phW/docW) × zoom*(phH/docH) physical pixels.
 */
function renderOnionSkinOverlay(
  onionCanvas: HTMLCanvasElement,
  ghosts: readonly OnionSkinGhost[],
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = onionCanvas.width;
  const phH = onionCanvas.height;
  const ctx = onionCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0) return;

  ctx.clearRect(0, 0, phW, phH);
  if (ghosts.length === 0) return;

  const { zoom, panX, panY } = viewport;
  const scaleX = (zoom * phW) / docW;
  const scaleY = (zoom * phH) / docH;
  const tx = (phW / 2) * (1 - zoom) + panX;
  const ty = (phH / 2) * (1 - zoom) + panY;

  // Reuse a single OffscreenCanvas for tinting all ghosts
  const tmp = new OffscreenCanvas(docW, docH);
  const tmpCtx = tmp.getContext('2d');
  if (!tmpCtx) return;

  ctx.save();

  for (const ghost of ghosts) {
    if (!ghost.frame.imageData) continue;

    // Draw frame pixels
    tmpCtx.clearRect(0, 0, docW, docH);
    tmpCtx.putImageData(ghost.frame.imageData, 0, 0);

    // Tint: multiply the existing pixels with the ghost colour
    tmpCtx.globalCompositeOperation = 'source-atop';
    const [r, g, b] = ghost.tint;
    tmpCtx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.5)`;
    tmpCtx.fillRect(0, 0, docW, docH);
    tmpCtx.globalCompositeOperation = 'source-over';

    // Composite onto the overlay canvas at the correct viewport position
    ctx.setTransform(scaleX, 0, 0, scaleY, tx, ty);
    ctx.globalAlpha = ghost.opacity;
    ctx.drawImage(tmp, 0, 0);
  }

  ctx.restore();
}

/** Clear the onion skin overlay canvas. */
function clearOnionCanvas(onionCanvas: HTMLCanvasElement | null): void {
  if (!onionCanvas) return;
  const ctx = onionCanvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, onionCanvas.width, onionCanvas.height);
}

export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SketchRenderer | null>(null);
  const brushRef = useRef<BrushEngine | null>(null);
  const rafRef = useRef<number>(0);
  const needsRenderRef = useRef(true);
  const lastTimeRef = useRef(performance.now());

  // Pixel tool state
  const pixelDataRef = useRef<ImageData | null>(null);
  const lastPixelPosRef = useRef<{ x: number; y: number } | null>(null);

  // Vector tool state
  const vectorStartRef = useRef<{ x: number; y: number } | null>(null);

  // Frame mode: track previous frame index to detect switches
  const prevFrameIndexRef = useRef(-1);
  // Ref so the render loop / stroke handlers can read playing state without deps
  const isFramePlayingRef = useRef(false);

  // ── Store subscriptions ──
  const canvas = useSketchStore((s) => s.canvas);
  const viewport = useSketchStore((s) => s.viewport);
  const layers = useSketchStore((s) => s.layers);
  const brushSettings = useSketchStore((s) => s.brushSettings);
  const activeTool = useSketchStore((s) => s.activeTool);
  const activeLayerId = useSketchStore((s) => s.activeLayerId);
  const markDirty = useSketchStore((s) => s.markDirty);

  // P1: filters and particles
  const filters = useSketchStore((s) => s.filters);
  const emitters = useSketchStore((s) => s.emitters);
  const isParticlePreviewActive = useSketchStore((s) => s.isParticlePreviewActive);

  // P0: frame mode
  const selectedFrameLayerId = useSketchStore((s) => s.selectedFrameLayerId);
  const currentFrameIndex = useSketchStore((s) => s.currentFrameIndex);
  const onionSkin = useSketchStore((s) => s.onionSkin);
  const isFramePlaying = useSketchStore((s) => s.isFramePlaying);

  // Keep isFramePlayingRef in sync without adding it as render-loop dep
  useEffect(() => {
    isFramePlayingRef.current = isFramePlaying;
  }, [isFramePlaying]);

  // Initialize renderer
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const renderer = new SketchRenderer();
    renderer.init(el, canvas.width, canvas.height);
    rendererRef.current = renderer;
    brushRef.current = new BrushEngine(renderer.pipeline);
    needsRenderRef.current = true;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
      brushRef.current = null;
    };
  }, [canvas.width, canvas.height]);

  // Resize observer — keep WebGL + onion-skin canvas in sync with container
  useEffect(() => {
    const el = canvasRef.current;
    const onionEl = onionCanvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (w > 0 && h > 0 && (el.width !== w || el.height !== h)) {
        el.width = w;
        el.height = h;
        rendererRef.current?.resize(w, h);
        needsRenderRef.current = true;
      }
      if (onionEl && w > 0 && h > 0) {
        onionEl.width = w;
        onionEl.height = h;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mark dirty when rendering-relevant state changes
  useEffect(() => {
    needsRenderRef.current = true;
  }, [layers, viewport, filters, emitters, isParticlePreviewActive, currentFrameIndex, onionSkin]);

  // Continuous render loop — uses renderWithEffects for filter/particle support (P1)
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (needsRenderRef.current) {
        const renderer = rendererRef.current;
        if (renderer) {
          const state = useSketchStore.getState();
          const now = performance.now();
          const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
          lastTimeRef.current = now;

          renderer.renderWithEffects(
            state.layers,
            state.viewport,
            state.filters,
            state.emitters,
            state.isParticlePreviewActive,
            dt,
          );

          // Onion skin overlay (P0)
          const onionEl = onionCanvasRef.current;
          if (onionEl) {
            if (state.onionSkin.enabled && state.selectedFrameLayerId) {
              const frameLayer = state.frameLayers.find((l) => l.id === state.selectedFrameLayerId);
              if (frameLayer) {
                const ghosts = computeOnionSkinGhosts(
                  frameLayer,
                  state.currentFrameIndex,
                  state.onionSkin,
                );
                renderOnionSkinOverlay(
                  onionEl,
                  ghosts,
                  state.canvas.width,
                  state.canvas.height,
                  state.viewport,
                );
              } else {
                clearOnionCanvas(onionEl);
              }
            } else {
              clearOnionCanvas(onionEl);
            }
          }

          needsRenderRef.current = false;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Frame save/restore on frame index change (P0) ──
  useEffect(() => {
    if (!selectedFrameLayerId) {
      prevFrameIndexRef.current = -1;
      return;
    }

    const renderer = rendererRef.current;
    if (!renderer) return;

    const prevIdx = prevFrameIndexRef.current;
    const state = useSketchStore.getState();

    // Save the outgoing frame only when the user manually switches (not during playback)
    if (prevIdx >= 0 && prevIdx !== currentFrameIndex && !isFramePlayingRef.current) {
      const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
      if (activeLayer?.texture) {
        const imgData = readTextureToImageData(
          renderer,
          activeLayer.texture,
          state.canvas.width,
          state.canvas.height,
        );
        state.updateFrameImageData(selectedFrameLayerId, prevIdx, imgData);
      }
    }

    prevFrameIndexRef.current = currentFrameIndex;

    // Load the incoming frame's pixels into the active layer texture
    const frameLayer = state.frameLayers.find((l) => l.id === selectedFrameLayerId);
    const newFrame = frameLayer?.frames.find((f) => f.index === currentFrameIndex);
    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);

    if (activeLayer?.texture) {
      if (newFrame?.imageData) {
        uploadImageDataToTexture(renderer, activeLayer.texture, newFrame.imageData);
      } else {
        // Clear texture for blank frames
        const empty = new Uint8Array(state.canvas.width * state.canvas.height * 4);
        renderer.textures.updateTexture(
          activeLayer.texture,
          0,
          0,
          state.canvas.width,
          state.canvas.height,
          empty,
        );
      }
    }

    needsRenderRef.current = true;
  }, [currentFrameIndex, selectedFrameLayerId]);

  // Determine which tools accept pointer input
  const isDrawTool =
    activeTool === 'brush' ||
    activeTool === 'eraser' ||
    activeTool === 'pixel' ||
    activeTool === 'vector';

  const onStrokeStart = useCallback(
    (point: StrokePoint) => {
      if (!activeLayerId) return;
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (activeTool === 'pixel') {
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;

        const w = canvas.width;
        const h = canvas.height;
        const imageData = layer.texture
          ? readTextureToImageData(renderer, layer.texture, w, h)
          : new ImageData(w, h);

        pixelDataRef.current = imageData;
        const { x: px, y: py } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        drawPixel(
          imageData,
          ix,
          iy,
          hexToRGBA(brushSettings.color),
          toPixelBrushSize(brushSettings.size),
        );
        lastPixelPosRef.current = { x: ix, y: iy };
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'vector') {
        const { x, y } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        vectorStartRef.current = { x, y };
        return;
      }

      // Default: brush / eraser
      const tex = renderer.textures.createTexture(canvas.width, canvas.height);
      const fbo = renderer.textures.createFramebuffer(tex);
      brushRef.current?.beginStroke(point, brushSettings, fbo);
      needsRenderRef.current = true;
    },
    [brushSettings, activeLayerId, activeTool, canvas.width, canvas.height, viewport],
  );

  const onStrokeMove = useCallback(
    (point: StrokePoint) => {
      if (activeTool === 'pixel') {
        const imageData = pixelDataRef.current;
        const lastPos = lastPixelPosRef.current;
        if (!imageData || !lastPos) return;

        const { x: px, y: py } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        drawLine(
          imageData,
          lastPos.x,
          lastPos.y,
          ix,
          iy,
          hexToRGBA(brushSettings.color),
          toPixelBrushSize(brushSettings.size),
        );
        lastPixelPosRef.current = { x: ix, y: iy };
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'vector') {
        // TODO(P2): render drag preview overlay
        return;
      }

      brushRef.current?.addPoint(point);
      needsRenderRef.current = true;
    },
    [activeTool, brushSettings, viewport],
  );

  const onStrokeEnd = useCallback(
    (point: StrokePoint) => {
      const renderer = rendererRef.current;

      if (activeTool === 'pixel') {
        const imageData = pixelDataRef.current;
        if (!imageData || !renderer || !activeLayerId) return;

        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;

        const texture =
          layer.texture ?? renderer.textures.createTexture(canvas.width, canvas.height);

        uploadImageDataToTexture(renderer, texture, imageData);

        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        // Persist to current frame if in frame mode
        if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
          state.updateFrameImageData(
            state.selectedFrameLayerId,
            state.currentFrameIndex,
            imageData,
          );
        }

        pixelDataRef.current = null;
        lastPixelPosRef.current = null;
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'vector') {
        const start = vectorStartRef.current;
        if (!start || !renderer || !activeLayerId) return;

        const { x: endX, y: endY } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );

        const w = Math.abs(endX - start.x);
        const h = Math.abs(endY - start.y);

        if (w < 2 && h < 2) {
          vectorStartRef.current = null;
          return;
        }

        const cx = (start.x + endX) / 2;
        const cy = (start.y + endY) / 2;
        const minX = Math.min(start.x, endX);
        const minY = Math.min(start.y, endY);
        const color = hexToRGBA(brushSettings.color);
        const fill = {
          color: [color[0], color[1], color[2], color[3]] as [number, number, number, number],
          rule: 'nonzero' as const,
        };

        const shapeType = useSketchStore.getState().activeShapeType;
        const paths =
          shapeType === 'ellipse'
            ? [createEllipse(cx, cy, w / 2, h / 2, fill)]
            : [createRectangle(minX, minY, w, h, fill)];

        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
          vectorStartRef.current = null;
          return;
        }

        renderPaths(ctx as unknown as CanvasRenderingContext2D, paths);
        const shapeData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) {
          vectorStartRef.current = null;
          return;
        }

        const texture =
          layer.texture ?? renderer.textures.createTexture(canvas.width, canvas.height);

        const readFbo = renderer.textures.createFramebuffer(texture);
        const existing = renderer.textures.readPixels(readFbo, 0, 0, canvas.width, canvas.height);
        renderer.textures.deleteFramebuffer(readFbo);

        const src = shapeData.data;
        for (let i = 0; i < src.length; i += 4) {
          const sa = src[i + 3]! / 255;
          if (sa > 0) {
            existing[i] = Math.round(src[i]! * sa + existing[i]! * (1 - sa));
            existing[i + 1] = Math.round(src[i + 1]! * sa + existing[i + 1]! * (1 - sa));
            existing[i + 2] = Math.round(src[i + 2]! * sa + existing[i + 2]! * (1 - sa));
            existing[i + 3] = Math.round(Math.min(255, src[i + 3]! + existing[i + 3]! * (1 - sa)));
          }
        }

        renderer.textures.updateTexture(texture, 0, 0, canvas.width, canvas.height, existing);

        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        // Persist to current frame if in frame mode
        if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
          const savedData = readTextureToImageData(renderer, texture, canvas.width, canvas.height);
          state.updateFrameImageData(
            state.selectedFrameLayerId,
            state.currentFrameIndex,
            savedData,
          );
        }

        vectorStartRef.current = null;
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      // Default: brush / eraser
      const result = brushRef.current?.endStroke();
      if (result) {
        // Persist to current frame if in frame mode
        const state = useSketchStore.getState();
        if (state.selectedFrameLayerId && !isFramePlayingRef.current && renderer) {
          const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
          if (activeLayer?.texture) {
            const imgData = readTextureToImageData(
              renderer,
              activeLayer.texture,
              canvas.width,
              canvas.height,
            );
            state.updateFrameImageData(
              state.selectedFrameLayerId,
              state.currentFrameIndex,
              imgData,
            );
          }
        }
        markDirty();
        needsRenderRef.current = true;
      }
    },
    [activeTool, activeLayerId, markDirty, canvas.width, canvas.height, viewport, brushSettings],
  );

  usePointerInput(canvasRef, { onStrokeStart, onStrokeMove, onStrokeEnd }, isDrawTool);

  return (
    <div className="relative block w-full h-full">
      <canvas
        ref={canvasRef}
        id="sketch-canvas"
        className="block w-full h-full"
        style={{ touchAction: 'none' }}
      />
      {/* Onion skin overlay — pointer-events:none so it does not block drawing */}
      <canvas
        ref={onionCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
