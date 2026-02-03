/**
 * useCanvas2DRender - Canvas 2D 渲染 Hook
 * Canvas 2D based rendering hook for preview
 *
 * 替代 useCompositorRender，使用 Canvas 2D API 进行渲染
 * 不依赖 @neko/media-engine
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProjectData } from '../types';
import {
  Canvas2DRenderEngine,
  getCanvas2DRenderEngine,
  type RenderMode,
  type RenderQuality,
  type RenderableElement,
} from '../rendering/canvas2d';

// =============================================================================
// Types
// =============================================================================

export interface Canvas2DRenderState {
  /** Whether initialized */
  isInitialized: boolean;
  /** Whether supported */
  isSupported: boolean;
  /** Whether currently rendering */
  isRendering: boolean;
  /** Error message */
  error: string | null;
}

export interface Canvas2DRenderOptions {
  /** Whether to use shared instance */
  shared?: boolean;
  /** Whether to auto-resize with canvas */
  autoResize?: boolean;
}

export interface Canvas2DRenderHook {
  /** Render state */
  state: Canvas2DRenderState;
  /** Canvas ref */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Initialize */
  initialize: (canvas?: HTMLCanvasElement) => Promise<boolean>;
  /** Resize */
  resize: (width: number, height: number) => void;
  /** Dispose */
  dispose: () => void;
  /** Render single frame */
  renderFrame: (elements: RenderableElement[]) => Promise<void>;
  /** Render project frame */
  renderProjectFrame: (
    project: ProjectData,
    time: number,
    mode?: RenderMode,
    quality?: RenderQuality
  ) => Promise<void>;
  /** Export to Blob */
  toBlob: (type?: string, quality?: number) => Promise<Blob | null>;
  /** Export to ImageBitmap */
  toImageBitmap: () => Promise<ImageBitmap | null>;
  /** Set URL resolver (VSCode webview) */
  setUrlResolver: (resolver: ((path: string) => Promise<string>) | undefined) => void;
  /** Start GOP preload */
  startPreload: (mediaUrl: string, startTime: number, fps?: number) => Promise<void>;
  /** Stop preload */
  stopPreload: (mediaUrl?: string) => void;
  /** Get preload status */
  getPreloadStatus: (mediaUrl: string) => {
    preloading: boolean;
    bufferedFrames: number;
    startTime: number | null;
    endTime: number | null;
  } | null;
  /** Clear cache and preload first time window (for seek/open) */
  clearAndPreloadFirstWindow: (mediaUrl: string, playhead: number, fps?: number) => Promise<void>;
  /** Smart preload based on buffer status */
  smartPreload: (mediaUrl: string, playhead: number, fps?: number) => Promise<void>;
  /** Get buffered duration after playhead */
  getBufferedDurationAfterPlayhead: (mediaUrl: string, playhead: number) => number;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useCanvas2DRender(options: Canvas2DRenderOptions = {}): Canvas2DRenderHook {
  const { shared = false, autoResize = true } = options;

  // State
  const [state, setState] = useState<Canvas2DRenderState>({
    isInitialized: false,
    isSupported: true,
    isRendering: false,
    error: null,
  });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Canvas2DRenderEngine | null>(null);
  const widthRef = useRef(0);
  const heightRef = useRef(0);

  // Get or create engine instance
  const getEngine = useCallback((): Canvas2DRenderEngine => {
    if (shared) {
      return getCanvas2DRenderEngine();
    }
    if (!engineRef.current) {
      engineRef.current = new Canvas2DRenderEngine();
    }
    return engineRef.current;
  }, [shared]);

  // Initialize
  const initialize = useCallback(
    async (canvas?: HTMLCanvasElement): Promise<boolean> => {
      const targetCanvas = canvas || canvasRef.current;
      if (!targetCanvas) {
        console.error('[useCanvas2DRender] No canvas element provided');
        setState((prev) => ({
          ...prev,
          error: 'No canvas element provided',
        }));
        return false;
      }

      console.log('[useCanvas2DRender] Starting initialization...', {
        canvasWidth: targetCanvas.width,
        canvasHeight: targetCanvas.height,
      });

      try {
        const engine = getEngine();
        const success = await engine.initialize(targetCanvas);

        if (success) {
          setState((prev) => ({
            ...prev,
            isInitialized: true,
            isSupported: true,
            error: null,
          }));
          widthRef.current = engine.width;
          heightRef.current = engine.height;
          console.log('[useCanvas2DRender] Initialized with Canvas 2D');
          return true;
        } else {
          console.error('[useCanvas2DRender] engine.initialize returned false');
          setState((prev) => ({
            ...prev,
            isInitialized: false,
            isSupported: false,
            error: 'Failed to initialize Canvas 2D compositor',
          }));
          return false;
        }
      } catch (err) {
        console.error('[useCanvas2DRender] Caught error:', err);
        setState((prev) => ({
          ...prev,
          isInitialized: false,
          isSupported: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
        return false;
      }
    },
    [getEngine]
  );

  // Resize
  const resize = useCallback(
    (width: number, height: number) => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine || !state.isInitialized) return;

      if (width !== widthRef.current || height !== heightRef.current) {
        engine.resize(width, height);
        widthRef.current = width;
        heightRef.current = height;
      }
    },
    [shared, state.isInitialized]
  );

  // Dispose
  const dispose = useCallback(() => {
    if (!shared && engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setState({
      isInitialized: false,
      isSupported: true,
      isRendering: false,
      error: null,
    });
  }, [shared]);

  // Render frame
  const renderFrame = useCallback(
    async (elements: RenderableElement[]): Promise<void> => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine || !state.isInitialized) return;

      setState((prev) => ({ ...prev, isRendering: true }));
      try {
        await engine.renderFrame(
          {
            project: {
              version: '1.0',
              name: '',
              resolution: { width: widthRef.current, height: heightRef.current },
              fps: 30,
              tracks: [],
            },
            time: 0,
            frameIndex: 0,
            width: widthRef.current,
            height: heightRef.current,
            fps: 30,
            mode: 'preview',
            quality: 'preview',
          },
          elements
        );
      } finally {
        setState((prev) => ({ ...prev, isRendering: false }));
      }
    },
    [shared, state.isInitialized]
  );

  // Render project frame
  const renderProjectFrame = useCallback(
    async (
      project: ProjectData,
      time: number,
      mode: RenderMode = 'preview',
      quality: RenderQuality = 'preview'
    ): Promise<void> => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine || !state.isInitialized) return;

      setState((prev) => ({ ...prev, isRendering: true }));
      try {
        await engine.renderProjectFrame(project, time, mode, quality);
      } finally {
        setState((prev) => ({ ...prev, isRendering: false }));
      }
    },
    [shared, state.isInitialized]
  );

  // Export to Blob
  const toBlob = useCallback(
    async (type?: string, quality?: number): Promise<Blob | null> => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine || !state.isInitialized) return null;
      try {
        return await engine.toBlob(type, quality);
      } catch {
        return null;
      }
    },
    [shared, state.isInitialized]
  );

  // Export to ImageBitmap
  const toImageBitmap = useCallback(async (): Promise<ImageBitmap | null> => {
    const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
    if (!engine || !state.isInitialized) return null;
    try {
      return await engine.toImageBitmap();
    } catch {
      return null;
    }
  }, [shared, state.isInitialized]);

  // Set URL resolver for MediaFrameProvider
  const setUrlResolver = useCallback(
    (resolver: ((path: string) => Promise<string>) | undefined) => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        console.warn('[useCanvas2DRender] Cannot set URL resolver: engine not initialized');
        return;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'setUrlResolver' in frameProvider) {
        (frameProvider as { setUrlResolver: (r: typeof resolver) => void }).setUrlResolver(
          resolver
        );
        console.log('[useCanvas2DRender] URL resolver set');
      } else {
        console.warn('[useCanvas2DRender] frameProvider does not have setUrlResolver');
      }
    },
    [shared]
  );

  // Start GOP preload for a video
  const startPreload = useCallback(
    async (mediaUrl: string, startTime: number, fps?: number): Promise<void> => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        return;
      }
      const frameProvider = engine.frameProvider;
      if (!frameProvider) {
        return;
      }
      if ('startPreload' in frameProvider) {
        await (
          frameProvider as {
            startPreload: (url: string, time: number, fps?: number) => Promise<void>;
          }
        ).startPreload(mediaUrl, startTime, fps);
      }
    },
    [shared]
  );

  // Stop preload for a video (or all videos)
  const stopPreload = useCallback(
    (mediaUrl?: string): void => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        return;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'stopPreload' in frameProvider) {
        (frameProvider as { stopPreload: (url?: string) => void }).stopPreload(mediaUrl);
      }
    },
    [shared]
  );

  // Get preload status for a video
  const getPreloadStatus = useCallback(
    (mediaUrl: string): {
      preloading: boolean;
      bufferedFrames: number;
      startTime: number | null;
      endTime: number | null;
    } | null => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        return null;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'getPreloadStatus' in frameProvider) {
        return (
          frameProvider as {
            getPreloadStatus: (url: string) => {
              preloading: boolean;
              bufferedFrames: number;
              startTime: number | null;
              endTime: number | null;
            } | null;
          }
        ).getPreloadStatus(mediaUrl);
      }
      return null;
    },
    [shared]
  );

  // Clear cache and preload first time window (for seek/open)
  const clearAndPreloadFirstWindow = useCallback(
    async (mediaUrl: string, playhead: number, fps?: number): Promise<void> => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        return;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'clearAndPreloadFirstWindow' in frameProvider) {
        await (
          frameProvider as {
            clearAndPreloadFirstWindow: (url: string, time: number, fps?: number) => Promise<void>;
          }
        ).clearAndPreloadFirstWindow(mediaUrl, playhead, fps);
      }
    },
    [shared]
  );

  // Smart preload based on buffer status
  const smartPreload = useCallback(
    async (mediaUrl: string, playhead: number, fps?: number): Promise<void> => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        return;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'smartPreload' in frameProvider) {
        await (
          frameProvider as {
            smartPreload: (url: string, time: number, fps?: number) => Promise<void>;
          }
        ).smartPreload(mediaUrl, playhead, fps);
      }
    },
    [shared]
  );

  // Get buffered duration after playhead
  const getBufferedDurationAfterPlayhead = useCallback(
    (mediaUrl: string, playhead: number): number => {
      const engine = engineRef.current || (shared ? getCanvas2DRenderEngine() : null);
      if (!engine) {
        return 0;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'getBufferedDurationAfterPlayhead' in frameProvider) {
        return (
          frameProvider as {
            getBufferedDurationAfterPlayhead: (url: string, time: number) => number;
          }
        ).getBufferedDurationAfterPlayhead(mediaUrl, playhead);
      }
      return 0;
    },
    [shared]
  );

  // Auto resize effect
  useEffect(() => {
    if (!autoResize || !canvasRef.current || !state.isInitialized) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          resize(Math.floor(width), Math.floor(height));
        }
      }
    });

    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [autoResize, state.isInitialized, resize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!shared && engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [shared]);

  return {
    state,
    canvasRef,
    initialize,
    resize,
    dispose,
    renderFrame,
    renderProjectFrame,
    toBlob,
    toImageBitmap,
    setUrlResolver,
    startPreload,
    stopPreload,
    getPreloadStatus,
    clearAndPreloadFirstWindow,
    smartPreload,
    getBufferedDurationAfterPlayhead,
  };
}
