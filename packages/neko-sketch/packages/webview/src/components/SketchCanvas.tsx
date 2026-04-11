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
import { useRef, useEffect, useCallback, useState } from 'react';
import { useSketchStore } from '../stores';
import { SketchRenderer } from '../engine';
import type { LightingConfig } from '../engine';
import type { LightSceneObject } from '../types/scene';
import { isLightObject } from '../types/scene';
import { BrushEngine } from '../brush';
import { usePointerInput } from '../hooks/usePointerInput';
import type { StrokePoint, LayerData } from '../types';
import type { OnionSkinGhost } from '../types/frame';
import type { ViewportState } from '../types';
import { drawPixel, drawLine, floodFill } from '../tools/pixel-tool';
import type { PixelBrushSize } from '../tools/pixel-tool';
import { createRectangle, createEllipse, createPolygon, createStar } from '../tools/vector-tool';
import { renderPaths } from '../engine/vector-renderer';
import { computeOnionSkinGhosts } from '../utils/frame-manager';
import { atmosphereToEmitter } from '../data/atmosphere-presets';
import { computeParallaxOffsets, buildParallaxTransform } from '../engine/parallax-renderer';
import {
  hitTestHandle,
  applyHandleDrag,
  applyTransformToPixels,
  INITIAL_MATRIX,
} from '../tools/transform-tool';
import type { TransformState } from '../tools/transform-tool';
import { TransformOverlay } from './TransformOverlay';
import { GuidesOverlay } from './GuidesOverlay';
import type { Guide } from './GuidesOverlay';
import { ReferenceOverlay } from './ReferenceOverlay';
import type { ReferenceImage } from './ReferenceOverlay';
import { PixelGrid } from './PixelGrid';
import { ContextMenu } from '@neko/shared/components';
import type { MenuItem } from '@neko/shared/components';
import { useTranslation } from '../i18n/I18nContext';

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
 * Render a selection rectangle preview on a 2D overlay canvas.
 * Draws a blue dashed rectangle in document coordinates.
 */
function renderSelectionPreview(
  previewCanvas: HTMLCanvasElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
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

  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < 1 && h < 1) return;

  ctx.save();
  ctx.setTransform(scaleX, 0, 0, scaleY, tx, ty);

  const invScale = 1 / Math.min(scaleX, scaleY);
  ctx.lineWidth = invScale;
  ctx.setLineDash([4 * invScale, 4 * invScale]);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';

  ctx.beginPath();
  ctx.rect(minX, minY, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** Render lasso path preview on a 2D overlay canvas. */
function renderLassoPreview(
  previewCanvas: HTMLCanvasElement,
  points: readonly { x: number; y: number }[],
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = previewCanvas.width;
  const phH = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0 || points.length < 2) return;

  ctx.clearRect(0, 0, phW, phH);

  const { zoom, panX, panY } = viewport;
  const scaleX = (zoom * phW) / docW;
  const scaleY = (zoom * phH) / docH;
  const tx = (phW / 2) * (1 - zoom) + panX;
  const ty = (phH / 2) * (1 - zoom) + panY;

  ctx.save();
  ctx.setTransform(scaleX, 0, 0, scaleY, tx, ty);

  const invScale = 1 / Math.min(scaleX, scaleY);
  ctx.lineWidth = invScale;
  ctx.setLineDash([4 * invScale, 4 * invScale]);
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';

  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
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

/** SVG overlay showing light position indicators when lighting is enabled. */
function LightOverlay() {
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);
  const viewport = useSketchStore((s) => s.viewport);

  const scene = activeSceneId ? scenes.find((s) => s.id === activeSceneId) : null;
  if (!scene?.lightingEnabled) return null;

  const lights: import('../types/scene').LightSceneObject[] = [];
  for (const sl of scene.layers) {
    for (const obj of sl.objects) {
      if (isLightObject(obj)) {
        lights.push(obj);
      }
    }
  }
  if (lights.length === 0) return null;

  const { zoom, panX, panY } = viewport;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {lights.map((obj) => {
        // Convert document coordinates to CSS screen coordinates
        const sx = obj.x * zoom + panX;
        const sy = obj.y * zoom + panY;
        const sr = obj.properties.radius * zoom;
        return (
          <g key={obj.id}>
            <circle
              cx={sx}
              cy={sy}
              r={sr}
              fill="none"
              stroke="rgba(255,200,50,0.25)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle cx={sx} cy={sy} r={6} fill="rgba(255,200,50,0.8)" />
            <circle cx={sx} cy={sy} r={3} fill="rgba(255,255,200,1)" />
          </g>
        );
      })}
    </svg>
  );
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

  // Move tool state — tracks starting screen position for pan delta
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);

  // Light drag state — when dragging a light object in move mode
  const lightDragRef = useRef<{
    sceneId: string;
    layerId: string;
    objectId: string;
    startX: number;
    startY: number;
  } | null>(null);

  // Select-rect tool state — tracks starting canvas position
  const selectStartRef = useRef<{ x: number; y: number } | null>(null);
  // Lasso selection: accumulates path points during drag
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  // Free transform state
  const [transformState, setTransformState] = useState<TransformState | null>(null);

  // Guides state (ruler guide lines)
  const [guides, setGuides] = useState<Guide[]>([]);
  const guideIdCounter = useRef(0);
  const addGuide = useCallback((axis: 'horizontal' | 'vertical', position: number) => {
    const id = `guide-${++guideIdCounter.current}`;
    setGuides((prev) => [...prev, { id, axis, position }]);
  }, []);
  const moveGuide = useCallback((id: string, position: number) => {
    setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, position } : g)));
  }, []);
  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  // Reference images state (floating overlays)
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const updateReferenceImage = useCallback((id: string, updates: Partial<ReferenceImage>) => {
    setReferenceImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
  }, []);
  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // Alt key state for zoom tool (Alt+click = zoom out)
  const altHeldRef = useRef(false);

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

  // Tool actions
  const setBrushColor = useSketchStore((s) => s.setBrushColor);
  const selectRect = useSketchStore((s) => s.selectRect);
  const zoomTo = useSketchStore((s) => s.zoomTo);
  const panBy = useSketchStore((s) => s.panBy);

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

      // Restore saved normal map data (base64 PNG from .nks file)
      if (layer.pendingNormalData && !layer.normalTexture) {
        const normalImg = new Image();
        normalImg.src = `data:image/png;base64,${layer.pendingNormalData}`;
        const layerId = layer.id;
        void normalImg.decode().then(() => {
          const offscreen = document.createElement('canvas');
          offscreen.width = layer.width;
          offscreen.height = layer.height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(normalImg, 0, 0);
          const imageData = ctx.getImageData(0, 0, layer.width, layer.height);
          const r = rendererRef.current;
          if (!r) return;
          const normalTex = r.textures.createTexture(
            layer.width,
            layer.height,
            new Uint8Array(imageData.data.buffer),
          );
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === layerId
                ? { ...l, normalTexture: normalTex, pendingNormalData: undefined }
                : l,
            ),
          );
          needsRenderRef.current = true;
        });
        changed = true;
        return { ...layer, pendingNormalData: undefined };
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
              alphaLock: false,
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

          // Apply layer offsetX/offsetY as transforms for the move tool
          for (const lr of layersToRender) {
            const ox = lr.offsetX ?? 0;
            const oy = lr.offsetY ?? 0;
            if ((ox !== 0 || oy !== 0) && !layerTransforms?.has(lr.id)) {
              if (!layerTransforms) layerTransforms = new Map();
              // Convert document-pixel offset to NDC-space translation
              const tx = (ox / state.canvas.width) * 2;
              const ty = -(oy / state.canvas.height) * 2;
              layerTransforms.set(lr.id, new Float32Array([1, 0, 0, 0, 1, 0, tx, ty, 1]));
            }
          }

          // Gather lighting configuration from active scene
          let lightingConfig: LightingConfig | undefined;
          if (activeScene?.lightingEnabled) {
            const lights: LightSceneObject[] = [];
            for (const sl of activeScene.layers) {
              for (const obj of sl.objects) {
                if (isLightObject(obj)) lights.push(obj);
              }
            }
            // Find first available normal map texture from visible layers
            let normalMapTex: WebGLTexture | null = null;
            for (const lr of layersToRender) {
              if (lr.visible && lr.normalTexture) {
                normalMapTex = lr.normalTexture;
                break;
              }
            }
            lightingConfig = {
              enabled: true,
              lights,
              ambient: activeScene.ambientLight,
              normalMapTex,
            };
          }

          renderer.renderWithEffects(
            layersToRender,
            state.viewport,
            state.filters,
            emittersForRender,
            emittersForRender.length > 0,
            dt,
            layerTransforms,
            lightingConfig,
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
  const isPointerTool =
    activeTool === 'brush' ||
    activeTool === 'eraser' ||
    activeTool === 'pixel' ||
    activeTool === 'shape' ||
    activeTool === 'eyedropper' ||
    activeTool === 'fill' ||
    activeTool === 'move' ||
    activeTool === 'zoom' ||
    activeTool === 'transform' ||
    activeTool === 'select-rect' ||
    activeTool === 'select-lasso' ||
    activeTool === 'select-wand';

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

      if (activeTool === 'eyedropper') {
        // Read pixel color from the WebGL canvas at the pointer position
        const el = canvasRef.current;
        if (!el) return;
        const dpr = window.devicePixelRatio || 1;
        const readX = Math.floor(point.x * dpr);
        const readY = Math.floor((el.clientHeight - point.y) * dpr); // GL y-flip
        const gl = el.getContext('webgl2');
        if (!gl) return;
        const pixel = new Uint8Array(4);
        gl.readPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const hex = `#${(pixel[0] ?? 0).toString(16).padStart(2, '0')}${(pixel[1] ?? 0).toString(16).padStart(2, '0')}${(pixel[2] ?? 0).toString(16).padStart(2, '0')}`;
        setBrushColor(hex);
        // Switch back to brush after picking
        useSketchStore.getState().setActiveTool('brush');
        return;
      }

      if (activeTool === 'fill') {
        // Flood fill at click position with current brush color
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;
        const w = canvas.width;
        const h = canvas.height;
        const imageData = layer.texture
          ? readTextureToImageData(renderer, layer.texture, w, h)
          : new ImageData(w, h);

        const { x: fx, y: fy } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        floodFill(imageData, Math.floor(fx), Math.floor(fy), hexToRGBA(brushSettings.color));

        const texture = layer.texture ?? renderer.textures.createTexture(w, h);
        uploadImageDataToTexture(renderer, texture, imageData);
        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'transform') {
        const { x: dx, y: dy } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );

        // If transform is already active, check handle hit
        if (transformState) {
          const handle = hitTestHandle(dx, dy, transformState.bounds, transformState.matrix);
          if (handle) {
            setTransformState({
              ...transformState,
              activeHandle: handle,
              dragStart: { x: dx, y: dy },
            });
            return;
          }
          // Click outside handles — confirm transform
          const layer = useSketchStore
            .getState()
            .layers.find((l) => l.id === transformState.layerId);
          if (layer?.texture && rendererRef.current) {
            const imgData = readTextureToImageData(
              rendererRef.current,
              layer.texture,
              canvas.width,
              canvas.height,
            );
            const transformed = applyTransformToPixels(
              imgData,
              transformState.matrix,
              canvas.width,
              canvas.height,
            );
            uploadImageDataToTexture(rendererRef.current, layer.texture, transformed);
            markDirty();
          }
          setTransformState(null);
          needsRenderRef.current = true;
          return;
        }

        // Start new transform on active layer
        if (activeLayerId) {
          setTransformState({
            layerId: activeLayerId,
            matrix: INITIAL_MATRIX,
            bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
            activeHandle: null,
            dragStart: null,
          });
        }
        return;
      }

      if (activeTool === 'zoom') {
        // Click to zoom in, Alt+click to zoom out
        const state = useSketchStore.getState();
        const el = canvasRef.current;
        if (!el) return;
        const factor = altHeldRef.current ? 1 / 1.5 : 1.5;
        const newZoom = Math.max(0.1, Math.min(32, state.viewport.zoom * factor));
        const dz = newZoom / state.viewport.zoom;
        const newPanX = point.x - dz * (point.x - state.viewport.panX);
        const newPanY = point.y - dz * (point.y - state.viewport.panY);
        useSketchStore.getState().setViewport({ zoom: newZoom, panX: newPanX, panY: newPanY });
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'move') {
        // Check if clicking on a light object first
        const { x: cx, y: cy } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        const state = useSketchStore.getState();
        const scene = state.activeSceneId
          ? state.scenes.find((s) => s.id === state.activeSceneId)
          : null;
        if (scene?.lightingEnabled) {
          for (const sl of scene.layers) {
            for (const obj of sl.objects) {
              if (isLightObject(obj)) {
                const dx = cx - obj.x;
                const dy = cy - obj.y;
                const hitRadius = Math.max(20, obj.properties.radius * 0.1);
                if (dx * dx + dy * dy < hitRadius * hitRadius) {
                  lightDragRef.current = {
                    sceneId: scene.id,
                    layerId: sl.id,
                    objectId: obj.id,
                    startX: point.x,
                    startY: point.y,
                  };
                  return;
                }
              }
            }
          }
        }
        // Start layer drag — tracks screen position for delta
        moveStartRef.current = { x: point.x, y: point.y };
        return;
      }

      if (activeTool === 'select-rect') {
        // Start rectangular selection
        const { x, y } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        selectStartRef.current = { x, y };
        return;
      }

      if (activeTool === 'select-lasso') {
        // Start lasso selection path
        const { x, y } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        lassoPointsRef.current = [{ x, y }];
        return;
      }

      if (activeTool === 'select-wand') {
        // Magic wand: instant selection on click
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer?.texture || !renderer) return;
        const { x, y } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        const fbo = renderer.textures.createFramebuffer(layer.texture);
        const pixels = renderer.textures.readPixels(fbo, 0, 0, canvas.width, canvas.height);
        renderer.textures.deleteFramebuffer(fbo);
        useSketchStore.getState().selectWand(pixels, x, y, 30, true);
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'shape') {
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

      // Gradient: drag to define start→end, apply on release
      if (activeTool === 'gradient') {
        const { x, y } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        selectStartRef.current = { x, y };
        return;
      }

      // Text: click to place text insertion point (opens text editor overlay)
      if (activeTool === 'text') {
        // TODO(P1): open text editing overlay at click position
        return;
      }

      // Clone stamp: Alt+click sets source, normal click clones
      if (activeTool === 'clone') {
        // TODO(P1): implement clone stamp pointer logic
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
      const storeState = useSketchStore.getState();
      const activeLayer = storeState.layers.find((l) => l.id === activeLayerId);
      const symmetryConfig = storeState.symmetry;
      // Set symmetry axis to canvas center if not explicitly positioned
      const symWithDefaults =
        symmetryConfig.mode !== 'none'
          ? {
              ...symmetryConfig,
              axisX: symmetryConfig.axisX || canvas.width / 2,
              axisY: symmetryConfig.axisY || canvas.height / 2,
            }
          : symmetryConfig;
      brushRef.current?.beginStroke(
        { ...point, x, y },
        brushSettings,
        fbo,
        canvas.width,
        canvas.height,
        activeLayer?.alphaLock ?? false,
        symWithDefaults,
      );
      needsRenderRef.current = true;
    },
    [
      brushSettings,
      activeLayerId,
      activeTool,
      canvas.width,
      canvas.height,
      viewport,
      setBrushColor,
    ],
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

      if (activeTool === 'move') {
        // Light drag takes priority
        const ld = lightDragRef.current;
        if (ld) {
          const dx = (point.x - ld.startX) / viewport.zoom;
          const dy = (point.y - ld.startY) / viewport.zoom;
          lightDragRef.current = { ...ld, startX: point.x, startY: point.y };
          const state = useSketchStore.getState();
          const sc = state.scenes.find((s) => s.id === ld.sceneId);
          const sl = sc?.layers.find((l) => l.id === ld.layerId);
          const obj = sl?.objects.find((o) => o.id === ld.objectId);
          if (obj) {
            state.updateSceneObject(ld.sceneId, ld.layerId, ld.objectId, {
              x: obj.x + dx,
              y: obj.y + dy,
            });
          }
          needsRenderRef.current = true;
          return;
        }

        // Move active layer by adjusting offsetX/offsetY
        const last = moveStartRef.current;
        if (!last) return;
        const dx = (point.x - last.x) / viewport.zoom;
        const dy = (point.y - last.y) / viewport.zoom;
        moveStartRef.current = { x: point.x, y: point.y };
        if (activeLayerId) {
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === activeLayerId
                ? { ...l, offsetX: (l.offsetX ?? 0) + dx, offsetY: (l.offsetY ?? 0) + dy }
                : l,
            ),
          );
        }
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'select-rect') {
        // Render selection preview rectangle
        const start = selectStartRef.current;
        const previewEl = vectorPreviewCanvasRef.current;
        if (!start || !previewEl) return;
        const { x: ex, y: ey } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        renderSelectionPreview(
          previewEl,
          start,
          { x: ex, y: ey },
          canvas.width,
          canvas.height,
          viewport,
        );
        return;
      }

      if (activeTool === 'select-lasso') {
        // Accumulate lasso path points and render preview
        const { x, y } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        lassoPointsRef.current.push({ x, y });
        // Render lasso path preview on overlay canvas
        const previewEl = vectorPreviewCanvasRef.current;
        if (previewEl && lassoPointsRef.current.length > 1) {
          renderLassoPreview(
            previewEl,
            lassoPointsRef.current,
            canvas.width,
            canvas.height,
            viewport,
          );
        }
        return;
      }

      if (activeTool === 'transform' && transformState?.activeHandle && transformState.dragStart) {
        const { x: dx, y: dy } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        const deltaX = dx - transformState.dragStart.x;
        const deltaY = dy - transformState.dragStart.y;
        const newMatrix = applyHandleDrag(
          transformState.matrix,
          transformState.activeHandle,
          deltaX,
          deltaY,
          transformState.bounds,
        );
        setTransformState({ ...transformState, matrix: newMatrix, dragStart: { x: dx, y: dy } });
        needsRenderRef.current = true;
        return;
      }

      // Tools that do nothing on move (single-click or handled elsewhere)
      if (
        activeTool === 'zoom' ||
        activeTool === 'eyedropper' ||
        activeTool === 'fill' ||
        activeTool === 'transform' ||
        activeTool === 'select-wand' ||
        activeTool === 'text' ||
        activeTool === 'clone'
      ) {
        return;
      }

      if (activeTool === 'shape') {
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
    [activeTool, brushSettings, viewport, panBy, activeLayerId, canvas.width, canvas.height],
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

      if (activeTool === 'move') {
        // Finish light drag if active
        if (lightDragRef.current) {
          lightDragRef.current = null;
          markDirty();
          needsRenderRef.current = true;
          return;
        }
        // Finish layer move — apply final delta
        const last = moveStartRef.current;
        if (last && activeLayerId) {
          const dx = (point.x - last.x) / viewport.zoom;
          const dy = (point.y - last.y) / viewport.zoom;
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === activeLayerId
                ? { ...l, offsetX: (l.offsetX ?? 0) + dx, offsetY: (l.offsetY ?? 0) + dy }
                : l,
            ),
          );
          markDirty();
          needsRenderRef.current = true;
        }
        moveStartRef.current = null;
        return;
      }

      if (activeTool === 'select-rect') {
        // Finish rectangular selection + clear preview overlay
        clearOverlayCanvas(vectorPreviewCanvasRef.current);
        const start = selectStartRef.current;
        if (!start) return;
        const { x: ex, y: ey } = screenToCanvas(
          point.x,
          point.y,
          viewport.zoom,
          viewport.panX,
          viewport.panY,
        );
        const x = Math.floor(Math.min(start.x, ex));
        const y = Math.floor(Math.min(start.y, ey));
        const w = Math.floor(Math.abs(ex - start.x));
        const h = Math.floor(Math.abs(ey - start.y));
        if (w > 0 && h > 0) {
          selectRect(x, y, w, h);
        }
        selectStartRef.current = null;
        return;
      }

      if (activeTool === 'select-lasso') {
        // Finish lasso selection + clear preview
        clearOverlayCanvas(vectorPreviewCanvasRef.current);
        const pts = lassoPointsRef.current;
        if (pts.length >= 3) {
          useSketchStore.getState().selectLasso(pts);
        }
        lassoPointsRef.current = [];
        return;
      }

      if (activeTool === 'transform' && transformState?.activeHandle) {
        // Release handle — stop dragging but keep transform active
        setTransformState({ ...transformState, activeHandle: null, dragStart: null });
        return;
      }

      // Single-click or no-end-action tools
      if (
        activeTool === 'zoom' ||
        activeTool === 'eyedropper' ||
        activeTool === 'fill' ||
        activeTool === 'text' ||
        activeTool === 'clone'
      ) {
        return;
      }

      if (activeTool === 'gradient') {
        // Finish gradient drag — apply gradient to active layer
        const start = selectStartRef.current;
        if (!start) return;
        // TODO(P1): render gradient shader to layer FBO using start→end
        selectStartRef.current = null;
        return;
      }

      if (activeTool === 'shape') {
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
        const radius = Math.min(w, h) / 2;
        let paths;
        switch (shapeType) {
          case 'ellipse':
            paths = [createEllipse(cx, cy, w / 2, h / 2, fill)];
            break;
          case 'polygon':
            paths = [createPolygon(cx, cy, radius, useSketchStore.getState().polygonSides, fill)];
            break;
          case 'star':
            paths = [
              createStar(cx, cy, radius, radius * 0.4, useSketchStore.getState().starPoints, fill),
            ];
            break;
          default:
            paths = [createRectangle(minX, minY, w, h, fill)];
            break;
        }

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
    [
      activeTool,
      activeLayerId,
      markDirty,
      canvas.width,
      canvas.height,
      viewport,
      brushSettings,
      selectRect,
      panBy,
    ],
  );

  usePointerInput(canvasRef, { onStrokeStart, onStrokeMove, onStrokeEnd }, isPointerTool);

  // ── Zoom & Pan interactions ──
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
      if (e.key === 'Alt') {
        altHeldRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        el.style.cursor = '';
      }
      if (e.key === 'Alt') {
        altHeldRef.current = false;
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

  // ── Tool cursor mapping ──
  const TOOL_CURSORS: Record<string, string> = {
    brush: 'crosshair',
    eraser: 'crosshair',
    'select-rect': 'crosshair',
    'select-lasso': 'crosshair',
    'select-wand': 'crosshair',
    move: 'grab',
    shape: 'crosshair',
    transform: 'default',
    eyedropper: 'crosshair',
    fill: 'crosshair',
    zoom: 'zoom-in',
    pixel: 'crosshair',
  };
  // Dynamic cursor: alt+zoom shows zoom-out
  const toolCursor =
    activeTool === 'zoom' && altHeldRef.current
      ? 'zoom-out'
      : (TOOL_CURSORS[activeTool] ?? 'crosshair');

  // ── Transform menu (shown when transform tool clicks canvas) ──
  const [transformMenu, setTransformMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Canvas right-click context menu ──
  const { t } = useTranslation();
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const selectAll = useSketchStore((s) => s.selectAll);
  const clearSelection = useSketchStore((s) => s.clearSelection);
  const selection = useSketchStore((s) => s.selection);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);

  // ── Layer pixel operations (flip, rotate, clear) ──
  const flipActiveLayerH = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = readTextureToImageData(renderer, layer.texture, w, h);
    // Flip horizontal: swap columns
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.floor(w / 2); x++) {
        const left = (y * w + x) * 4;
        const right = (y * w + (w - 1 - x)) * 4;
        for (let c = 0; c < 4; c++) {
          const tmp = imgData.data[left + c]!;
          imgData.data[left + c] = imgData.data[right + c]!;
          imgData.data[right + c] = tmp;
        }
      }
    }
    uploadImageDataToTexture(renderer, layer.texture, imgData);
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const flipActiveLayerV = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = readTextureToImageData(renderer, layer.texture, w, h);
    // Flip vertical: swap rows
    for (let y = 0; y < Math.floor(h / 2); y++) {
      for (let x = 0; x < w; x++) {
        const top = (y * w + x) * 4;
        const bottom = ((h - 1 - y) * w + x) * 4;
        for (let c = 0; c < 4; c++) {
          const tmp = imgData.data[top + c]!;
          imgData.data[top + c] = imgData.data[bottom + c]!;
          imgData.data[bottom + c] = tmp;
        }
      }
    }
    uploadImageDataToTexture(renderer, layer.texture, imgData);
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const rotateActiveLayer90 = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const w = canvas.width;
    const h = canvas.height;
    // For non-square canvases, rotation crops/pads. Keep it simple: rotate in-place.
    const imgData = readTextureToImageData(renderer, layer.texture, w, h);
    const rotated = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // 90° CW: (x, y) → (h-1-y, x) — clamped to canvas bounds
        const srcX = y;
        const srcY = w - 1 - x;
        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const si = (srcY * w + srcX) * 4;
          const di = (y * w + x) * 4;
          rotated.data[di] = imgData.data[si]!;
          rotated.data[di + 1] = imgData.data[si + 1]!;
          rotated.data[di + 2] = imgData.data[si + 2]!;
          rotated.data[di + 3] = imgData.data[si + 3]!;
        }
      }
    }
    uploadImageDataToTexture(renderer, layer.texture, rotated);
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const clearActiveLayer = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const empty = new Uint8Array(canvas.width * canvas.height * 4);
    renderer.textures.updateTexture(layer.texture, 0, 0, canvas.width, canvas.height, empty);
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCanvasMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Transform menu items (shown when transform tool clicks canvas)
  const transformMenuItems = useCallback(
    (): MenuItem[] => [
      { label: t('sketch.canvas.flipH'), onClick: flipActiveLayerH },
      { label: t('sketch.canvas.flipV'), onClick: flipActiveLayerV },
      { separator: true },
      { label: t('sketch.canvas.rotate90'), onClick: rotateActiveLayer90 },
      { separator: true },
      { label: t('sketch.canvas.clearLayer'), danger: true, onClick: clearActiveLayer },
    ],
    [t, flipActiveLayerH, flipActiveLayerV, rotateActiveLayer90, clearActiveLayer],
  );

  const contextMenuItems = useCallback((): MenuItem[] => {
    const state = useSketchStore.getState();
    const items: MenuItem[] = [
      {
        label: t('sketch.canvas.undo'),
        shortcut: '⌘Z',
        disabled: !state.canUndo,
        onClick: () => undo(),
      },
      {
        label: t('sketch.canvas.redo'),
        shortcut: '⇧⌘Z',
        disabled: !state.canRedo,
        onClick: () => redo(),
      },
      { separator: true },
      {
        label: t('sketch.canvas.selectAll'),
        shortcut: '⌘A',
        onClick: () => selectAll(),
      },
    ];
    if (state.selection) {
      items.push({
        label: t('sketch.canvas.deselect'),
        onClick: () => clearSelection(),
      });
    }
    items.push(
      { separator: true },
      { label: t('sketch.canvas.flipH'), onClick: flipActiveLayerH },
      { label: t('sketch.canvas.flipV'), onClick: flipActiveLayerV },
      { label: t('sketch.canvas.rotate90'), onClick: rotateActiveLayer90 },
      { separator: true },
      { label: t('sketch.canvas.clearLayer'), danger: true, onClick: clearActiveLayer },
      { separator: true },
      {
        label: 'Add Reference Image...',
        onClick: () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              const id = `ref-${Date.now()}`;
              setReferenceImages((prev) => [
                ...prev,
                { id, src, x: 50, y: 50, width: 200, height: 200, opacity: 0.5 },
              ]);
            };
            reader.readAsDataURL(file);
          };
          input.click();
        },
      },
      { separator: true },
      {
        label: t('sketch.canvas.zoomIn'),
        onClick: () => {
          const s = useSketchStore.getState();
          const newZoom = Math.min(32, s.viewport.zoom * 1.5);
          zoomTo(newZoom);
          needsRenderRef.current = true;
        },
      },
      {
        label: t('sketch.canvas.zoomOut'),
        onClick: () => {
          const s = useSketchStore.getState();
          const newZoom = Math.max(0.1, s.viewport.zoom / 1.5);
          zoomTo(newZoom);
          needsRenderRef.current = true;
        },
      },
      {
        label: t('sketch.canvas.resetZoom'),
        onClick: () => {
          useSketchStore.getState().resetViewport();
          needsRenderRef.current = true;
        },
      },
    );
    return items;
  }, [
    t,
    selectAll,
    clearSelection,
    zoomTo,
    selection,
    undo,
    redo,
    canUndo,
    canRedo,
    flipActiveLayerH,
    flipActiveLayerV,
    rotateActiveLayer90,
    clearActiveLayer,
  ]);

  return (
    <div
      className="relative block w-full h-full"
      style={{ cursor: toolCursor }}
      onContextMenu={handleContextMenu}
    >
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
      {/* Ruler and guide lines overlay */}
      <GuidesOverlay
        guides={guides}
        viewport={viewport}
        canvasWidth={canvas.width}
        canvasHeight={canvas.height}
        onAddGuide={addGuide}
        onMoveGuide={moveGuide}
        onRemoveGuide={removeGuide}
      />
      {/* Reference images overlay */}
      <ReferenceOverlay
        images={referenceImages}
        onUpdate={updateReferenceImage}
        onRemove={removeReferenceImage}
      />
      {/* Light position indicators — shows light icons when lighting is active */}
      <LightOverlay />
      {/* Transform handles — visible when transform tool is active */}
      {transformState && <TransformOverlay transform={transformState} viewport={viewport} />}

      {/* Canvas right-click context menu */}
      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={contextMenuItems()}
          onClose={() => setCanvasMenu(null)}
        />
      )}

      {/* Transform tool action menu */}
      {transformMenu && (
        <ContextMenu
          x={transformMenu.x}
          y={transformMenu.y}
          items={transformMenuItems()}
          onClose={() => setTransformMenu(null)}
        />
      )}
    </div>
  );
}
