/**
 * SketchCanvas - WebGL canvas with renderer integration
 *
 * Initializes the WebGL renderer, handles resize, and
 * connects pointer input to the brush engine, pixel tool, and vector tool.
 */
import { useRef, useEffect, useCallback } from 'react';
import { useSketchStore } from '../stores';
import { SketchRenderer } from '../engine';
import { BrushEngine } from '../brush';
import { usePointerInput } from '../hooks/usePointerInput';
import type { StrokePoint } from '../types';
import { drawPixel, drawLine } from '../tools/pixel-tool';
import type { PixelBrushSize } from '../tools/pixel-tool';
import { createRectangle, createEllipse } from '../tools/vector-tool';
import { renderPaths } from '../engine/vector-renderer';

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
  // Copy into a fresh Uint8ClampedArray backed by a plain ArrayBuffer
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

export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SketchRenderer | null>(null);
  const brushRef = useRef<BrushEngine | null>(null);

  // Pixel tool state
  const pixelDataRef = useRef<ImageData | null>(null);
  const lastPixelPosRef = useRef<{ x: number; y: number } | null>(null);

  // Vector tool state
  const vectorStartRef = useRef<{ x: number; y: number } | null>(null);

  const canvas = useSketchStore((s) => s.canvas);
  const viewport = useSketchStore((s) => s.viewport);
  const layers = useSketchStore((s) => s.layers);
  const brushSettings = useSketchStore((s) => s.brushSettings);
  const activeTool = useSketchStore((s) => s.activeTool);
  const activeLayerId = useSketchStore((s) => s.activeLayerId);
  const markDirty = useSketchStore((s) => s.markDirty);

  // Initialize renderer
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const renderer = new SketchRenderer();
    renderer.init(el, canvas.width, canvas.height);
    rendererRef.current = renderer;
    brushRef.current = new BrushEngine(renderer.pipeline);
    return () => {
      renderer.dispose();
      rendererRef.current = null;
      brushRef.current = null;
    };
  }, [canvas.width, canvas.height]);

  // Render loop
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.render(layers, viewport);
  }, [layers, viewport]);

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
        // Read current layer texture into ImageData for pixel editing
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
        return;
      }

      if (activeTool === 'vector') {
        // TODO(P2): render drag preview overlay
        return;
      }

      brushRef.current?.addPoint(point);
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

        // Persist texture reference back to the store
        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        pixelDataRef.current = null;
        lastPixelPosRef.current = null;
        markDirty();
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

        // Ignore gestures too small to be intentional
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

        // Render paths to an offscreen Canvas2D, then composite onto the layer texture
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

        // Read existing layer content and alpha-over composite the shape
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

        vectorStartRef.current = null;
        markDirty();
        return;
      }

      // Default: brush / eraser
      const result = brushRef.current?.endStroke();
      if (result) {
        markDirty();
      }
    },
    [activeTool, activeLayerId, markDirty, canvas.width, canvas.height, viewport, brushSettings],
  );

  usePointerInput(canvasRef, { onStrokeStart, onStrokeMove, onStrokeEnd }, isDrawTool);

  return (
    <canvas
      ref={canvasRef}
      id="sketch-canvas"
      className="block w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}
