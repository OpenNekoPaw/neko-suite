/**
 * SketchCanvas - WebGL canvas with renderer integration
 *
 * Initializes the WebGL renderer, handles resize, and
 * connects pointer input to the brush engine.
 */
import { useRef, useEffect, useCallback } from 'react';
import { useSketchStore } from '../stores';
import { SketchRenderer } from '../engine';
import { BrushEngine } from '../brush';
import { usePointerInput } from '../hooks/usePointerInput';
import type { StrokePoint } from '../types';

export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SketchRenderer | null>(null);
  const brushRef = useRef<BrushEngine | null>(null);

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

  // Pointer input for drawing
  const isDrawTool = activeTool === 'brush' || activeTool === 'eraser';

  const onStrokeStart = useCallback(
    (point: StrokePoint) => {
      if (!activeLayerId) return;
      const renderer = rendererRef.current;
      if (!renderer) return;
      // Get or create FBO for active layer
      const tex = renderer.textures.createTexture(canvas.width, canvas.height);
      const fbo = renderer.textures.createFramebuffer(tex);
      brushRef.current?.beginStroke(point, brushSettings, fbo);
    },
    [brushSettings, activeLayerId, canvas.width, canvas.height],
  );

  const onStrokeMove = useCallback((point: StrokePoint) => {
    brushRef.current?.addPoint(point);
  }, []);

  const onStrokeEnd = useCallback(
    (_point: StrokePoint) => {
      const result = brushRef.current?.endStroke();
      if (result) {
        markDirty();
      }
    },
    [markDirty],
  );

  usePointerInput(
    canvasRef,
    {
      onStrokeStart,
      onStrokeMove,
      onStrokeEnd,
    },
    isDrawTool,
  );

  return (
    <canvas
      ref={canvasRef}
      id="sketch-canvas"
      className="block w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}
