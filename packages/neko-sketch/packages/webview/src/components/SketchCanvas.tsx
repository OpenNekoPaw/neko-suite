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
 *
 * Vector drag preview:
 *   - A separate 2D canvas overlay shows the shape outline while dragging.
 */
import { useRef, useEffect, useCallback } from 'react';
import { useSketchStore } from '../stores';
import { SketchRenderer } from '../engine';
import { BrushEngine } from '../brush';
import { usePointerInput } from '../hooks/usePointerInput';
import type { StrokePoint, LayerData } from '../types';
import type { OnionSkinGhost } from '../types/frame';
import type { ViewportState } from '../types';
import { drawPixel, drawLine } from '../tools/pixel-tool';
import type { PixelBrushSize } from '../tools/pixel-tool';
import { createRectangle, createEllipse } from '../tools/vector-tool';
import { renderPaths } from '../engine/vector-renderer';
import { computeOnionSkinGhosts } from '../utils/frame-manager';
import { atmosphereToEmitter } from '../data/atmosphere-presets';
import { computeParallaxOffsets, buildParallaxTransform } from '../engine/parallax-renderer';
import { PixelGrid } from './PixelGrid';

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

/** Clear a 2D overlay canvas. */
function clearOverlayCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Render a vector shape drag preview on a 2D overlay canvas.
 *
 * Draws a translucent filled shape with a dashed stroke outline in document
 * coordinates, transformed to screen coordinates using the current viewport.
 */
function renderVectorPreview(
  previewCanvas: HTMLCanvasElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  shapeType: string,
  color: readonly [number, number, number, number],
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = previewCanvas.width;
  const phH = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0) return;

  ctx.clearRect(0, 0, phW, phH);

  const { zoom, panX, panY } = viewport;
  const scaleX = (zoom * phW) / docW;
  const scaleY = (zoom * phH) / docH;
  const tx = (phW / 2) * (1 - zoom) + panX;
  const ty = (phH / 2) * (1 - zoom) + panY;

  const [r, g, b, a] = color;
  const rr = Math.round(r * 255);
  const gg = Math.round(g * 255);
  const bb = Math.round(b * 255);

  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < 1 && h < 1) return;

  ctx.save();
  ctx.setTransform(scaleX, 0, 0, scaleY, tx, ty);

  // Thin dashed line in document-pixel units
  const invScale = 1 / Math.min(scaleX, scaleY);
  ctx.lineWidth = invScale;
  ctx.setLineDash([4 * invScale, 4 * invScale]);
  ctx.fillStyle = `rgba(${rr},${gg},${bb},${(a * 0.2).toFixed(2)})`;
  ctx.strokeStyle = `rgba(${rr},${gg},${bb},${a.toFixed(2)})`;

  ctx.beginPath();
  if (shapeType === 'ellipse') {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(minX, minY, w, h);
  }
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement>(null);
  const vectorPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
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

  // Brush stroke scratch texture (created in onStrokeStart, merged in onStrokeEnd)
  const strokeTexRef = useRef<WebGLTexture | null>(null);
  const strokeFboRef = useRef<WebGLFramebuffer | null>(null);

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

  // S.3: scene atmosphere effects
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);

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

  // Initialize layer textures — restore pending data from .nks and create fill layer textures
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let changed = false;
    const updated = layers.map((layer) => {
      // Skip layers that already have a texture
      if (layer.texture) return layer;

      // Restore saved pixel data (base64 PNG from .nks file)
      if (layer.pendingData) {
        const img = new Image();
        img.src = `data:image/png;base64,${layer.pendingData}`;
        // Synchronous decode via canvas is not possible; schedule async restore
        const layerId = layer.id;
        void img.decode().then(() => {
          const offscreen = document.createElement('canvas');
          offscreen.width = layer.width;
          offscreen.height = layer.height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, layer.width, layer.height);
          const r = rendererRef.current;
          if (!r) return;
          const tex = r.textures.createTexture(
            layer.width,
            layer.height,
            new Uint8Array(imageData.data.buffer),
          );
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === layerId ? { ...l, texture: tex, pendingData: undefined } : l,
            ),
          );
          needsRenderRef.current = true;
        });
        // Clear pendingData immediately to avoid re-triggering
        changed = true;
        return { ...layer, pendingData: undefined };
      }

      // Create solid-color texture for fill layers
      if (layer.type === 'fill') {
        const w = layer.width;
        const h = layer.height;
        const pixels = new Uint8Array(w * h * 4);
        // Parse background color from canvas config
        const bgColor = canvas.backgroundColor ?? '#ffffff';
        const hex = bgColor.startsWith('#') ? bgColor.slice(1) : bgColor;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i] = r;
          pixels[i + 1] = g;
          pixels[i + 2] = b;
          pixels[i + 3] = 255;
        }
        const tex = renderer.textures.createTexture(w, h, pixels);
        changed = true;
        return { ...layer, texture: tex };
      }

      return layer;
    });

    if (changed) {
      useSketchStore.getState().setLayers(updated);
      needsRenderRef.current = true;
    }
  }, [layers, canvas.backgroundColor]);

  // Resize observer — keep WebGL + overlay canvases in sync with container
  useEffect(() => {
    const el = canvasRef.current;
    const onionEl = onionCanvasRef.current;
    const vectorEl = vectorPreviewCanvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (el.width !== w || el.height !== h) {
        // WebGLContext.resize expects CSS pixels and applies DPR internally.
        rendererRef.current?.resize(width, height);
        needsRenderRef.current = true;
      }
      // Keep overlay canvases at device pixel resolution
      if (onionEl) {
        onionEl.width = w;
        onionEl.height = h;
      }
      if (vectorEl) {
        vectorEl.width = w;
        vectorEl.height = h;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mark dirty when rendering-relevant state changes
  useEffect(() => {
    needsRenderRef.current = true;
  }, [
    layers,
    viewport,
    filters,
    emitters,
    isParticlePreviewActive,
    currentFrameIndex,
    onionSkin,
    scenes,
    activeSceneId,
  ]);

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

          // Combine manual emitters with atmosphere effect from the active scene
          const activeScene = state.activeSceneId
            ? state.scenes.find((s) => s.id === state.activeSceneId)
            : null;
          const atmosphereEmitter = activeScene
            ? atmosphereToEmitter(activeScene.atmosphere)
            : null;
          const emittersForRender = [
            ...(state.isParticlePreviewActive ? state.emitters : []),
            ...(atmosphereEmitter ? [atmosphereEmitter] : []),
          ];

          // Inject active stroke texture as a temporary overlay for real-time preview
          let layersToRender: ReadonlyArray<LayerData> = state.layers;
          if (strokeTexRef.current && state.activeLayerId) {
            const strokeLayer: LayerData = {
              id: '__stroke_preview',
              name: '',
              type: 'raster',
              width: state.canvas.width,
              height: state.canvas.height,
              visible: true,
              locked: false,
              opacity: state.brushSettings.opacity,
              blendMode: 'normal',
              offsetX: 0,
              offsetY: 0,
              clippingMask: false,
              maskLayerId: null,
              children: [],
              texture: strokeTexRef.current,
            };
            // Insert stroke layer right after the active layer
            const mutable = [...state.layers];
            const idx = mutable.findIndex((l) => l.id === state.activeLayerId);
            if (idx >= 0) {
              mutable.splice(idx + 1, 0, strokeLayer);
            } else {
              mutable.push(strokeLayer);
            }
            layersToRender = mutable;
          }

          // Compute per-layer parallax transforms when a scene is active
          let layerTransforms: Map<string, Float32Array> | undefined;
          if (activeScene) {
            const views = computeParallaxOffsets(activeScene.layers, activeScene.camera);
            const el = canvasRef.current;
            if (el) {
              const cssW = el.clientWidth;
              const cssH = el.clientHeight;
              layerTransforms = new Map();
              for (const view of views) {
                const sl = activeScene.layers.find((l) => l.id === view.layerId);
                if (sl?.canvasLayerId) {
                  layerTransforms.set(
                    sl.canvasLayerId,
                    buildParallaxTransform(view, activeScene.camera, cssW, cssH),
                  );
                }
              }
            }
          }

          renderer.renderWithEffects(
            layersToRender,
            state.viewport,
            state.filters,
            emittersForRender,
            emittersForRender.length > 0,
            dt,
            layerTransforms,
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
                clearOverlayCanvas(onionEl);
              }
            } else {
              clearOverlayCanvas(onionEl);
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
      if (!activeLayerId || spaceHeldRef.current) return;
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

      // Default: brush / eraser — draw to scratch texture, merge on stroke end
      const { x, y } = screenToCanvas(
        point.x,
        point.y,
        viewport.zoom,
        viewport.panX,
        viewport.panY,
      );
      const tex = renderer.textures.createTexture(canvas.width, canvas.height);
      const fbo = renderer.textures.createFramebuffer(tex);
      strokeTexRef.current = tex;
      strokeFboRef.current = fbo;
      brushRef.current?.beginStroke(
        { ...point, x, y },
        brushSettings,
        fbo,
        canvas.width,
        canvas.height,
      );
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
        const start = vectorStartRef.current;
        const vectorEl = vectorPreviewCanvasRef.current;
        if (!start || !vectorEl) return;
        const { x: ex, y: ey } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        renderVectorPreview(
          vectorEl,
          start,
          { x: ex, y: ey },
          useSketchStore.getState().activeShapeType,
          hexToRGBA(brushSettings.color),
          canvas.width,
          canvas.height,
          viewport,
        );
        return;
      }

      const { x: bx, y: by } = screenToCanvas(
        point.x,
        point.y,
        viewport.zoom,
        viewport.panX,
        viewport.panY,
      );
      brushRef.current?.addPoint({ ...point, x: bx, y: by });
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
        clearOverlayCanvas(vectorPreviewCanvasRef.current);
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      // Default: brush / eraser — merge scratch texture into active layer
      const result = brushRef.current?.endStroke();
      if (result && renderer && activeLayerId && strokeTexRef.current && strokeFboRef.current) {
        const state = useSketchStore.getState();
        const layer = state.layers.find((l) => l.id === activeLayerId);
        if (layer) {
          const w = canvas.width;
          const h = canvas.height;

          // Get or create layer texture
          const layerTex = layer.texture ?? renderer.textures.createTexture(w, h);

          // Read stroke pixels from scratch FBO
          const strokePixels = renderer.textures.readPixels(strokeFboRef.current, 0, 0, w, h);

          // Read existing layer pixels
          const layerFbo = renderer.textures.createFramebuffer(layerTex);
          const layerPixels = renderer.textures.readPixels(layerFbo, 0, 0, w, h);
          renderer.textures.deleteFramebuffer(layerFbo);

          // Alpha composite stroke over layer.
          // Stroke FBO pixels are in premultiplied alpha format (GPU blending
          // outputs rgb = color.rgb * alpha, a = alpha). Layer pixels are straight.
          const isEraser = activeTool === 'eraser';
          for (let i = 0; i < strokePixels.length; i += 4) {
            const sa = strokePixels[i + 3]! / 255;
            if (sa > 0) {
              if (isEraser) {
                // Eraser: reduce layer alpha
                layerPixels[i + 3] = Math.round(Math.max(0, layerPixels[i + 3]! * (1 - sa)));
              } else {
                // Premultiplied-over-straight composite:
                // Convert layer to premultiplied, blend, then convert back.
                const da = layerPixels[i + 3]! / 255;
                const outA = sa + da * (1 - sa);
                if (outA > 0) {
                  const invA = 1 / outA;
                  layerPixels[i] = Math.round(
                    Math.min(255, (strokePixels[i]! + layerPixels[i]! * da * (1 - sa)) * invA),
                  );
                  layerPixels[i + 1] = Math.round(
                    Math.min(
                      255,
                      (strokePixels[i + 1]! + layerPixels[i + 1]! * da * (1 - sa)) * invA,
                    ),
                  );
                  layerPixels[i + 2] = Math.round(
                    Math.min(
                      255,
                      (strokePixels[i + 2]! + layerPixels[i + 2]! * da * (1 - sa)) * invA,
                    ),
                  );
                }
                layerPixels[i + 3] = Math.round(Math.min(255, outA * 255));
              }
            }
          }

          renderer.textures.updateTexture(layerTex, 0, 0, w, h, layerPixels);
          state.setLayers(
            state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture: layerTex } : l)),
          );

          // Persist to current frame if in frame mode
          if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
            const imgData = readTextureToImageData(renderer, layerTex, w, h);
            state.updateFrameImageData(
              state.selectedFrameLayerId,
              state.currentFrameIndex,
              imgData,
            );
          }
        }

        // Cleanup scratch texture
        renderer.textures.deleteFramebuffer(strokeFboRef.current);
        renderer.textures.deleteTexture(strokeTexRef.current);
        strokeTexRef.current = null;
        strokeFboRef.current = null;

        markDirty();
        needsRenderRef.current = true;
      }
    },
    [activeTool, activeLayerId, markDirty, canvas.width, canvas.height, viewport, brushSettings],
  );

  usePointerInput(canvasRef, { onStrokeStart, onStrokeMove, onStrokeEnd }, isDrawTool);

  // ── Zoom & Pan interactions ──
  const panBy = useSketchStore((s) => s.panBy);
  const isPanningRef = useRef(false);
  const panLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const spaceHeldRef = useRef(false);

  // Wheel zoom (centered on cursor)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useSketchStore.getState();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.1, Math.min(32, state.viewport.zoom * factor));
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Adjust pan so the point under the cursor stays in place
      const dz = newZoom / state.viewport.zoom;
      const newPanX = cx - dz * (cx - state.viewport.panX);
      const newPanY = cy - dz * (cy - state.viewport.panY);
      useSketchStore.getState().setViewport({ zoom: newZoom, panX: newPanX, panY: newPanY });
      needsRenderRef.current = true;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Middle-button drag pan + Space+drag pan
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      // Middle mouse button (button=1) or space+left click
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        panLastPosRef.current = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!isPanningRef.current || !panLastPosRef.current) return;
      const dx = e.clientX - panLastPosRef.current.x;
      const dy = e.clientY - panLastPosRef.current.y;
      panLastPosRef.current = { x: e.clientX, y: e.clientY };
      panBy(dx, dy);
      needsRenderRef.current = true;
    };
    const onUp = (e: PointerEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panLastPosRef.current = null;
        el.releasePointerCapture(e.pointerId);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        spaceHeldRef.current = true;
        el.style.cursor = 'grab';
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        el.style.cursor = '';
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [panBy]);

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
      {/* Vector drag preview — dashed outline shown while drawing shapes */}
      <canvas
        ref={vectorPreviewCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      />
      {/* Pixel grid — visible only in pixel tool at sufficient zoom */}
      <PixelGrid canvasWidth={canvas.width} canvasHeight={canvas.height} />
    </div>
  );
}
