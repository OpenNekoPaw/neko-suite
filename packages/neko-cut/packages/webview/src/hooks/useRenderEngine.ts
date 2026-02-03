/**
 * useRenderEngine - 通用渲染引擎 Hook
 * Universal Render Engine Hook with GPU/Canvas2D auto-switching
 *
 * 支持 WebGPU/WebGL 和 Canvas 2D 后端自动切换
 * 提供与 useCanvas2DRender 兼容的接口
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProjectData } from '../types';
import type { RenderMode, RenderQuality, RenderableElement } from '../rendering/canvas2d';
import { Canvas2DRenderEngine, getCanvas2DRenderEngine } from '../rendering/canvas2d';
import {
  GPURenderEngine,
  createRenderEngine,
  type RenderEngineBackend,
  type RenderEngineType,
  type FrameProviderMode,
  type FramePerformanceStats,
  type GPUStats,
} from '../rendering/gpu';
import type { BasicModeError, ModeGetter } from '../rendering/unified/mediaFrameProvider';
import type { IMediaRequestProxy } from '../services/MediaRequestProxy';

// =============================================================================
// Types
// =============================================================================

/**
 * Render engine state
 */
export interface RenderEngineState {
  /** Whether initialized */
  isInitialized: boolean;
  /** Whether GPU is supported */
  isGPUSupported: boolean;
  /** Whether currently rendering */
  isRendering: boolean;
  /** Current backend type */
  backend: RenderEngineType | null;
  /** Error message */
  error: string | null;
}

/**
 * Render engine options
 */
export interface RenderEngineOptions {
  /** Preferred backend ('auto' | 'gpu' | 'canvas2d') */
  preferredBackend?: RenderEngineBackend;
  /** Whether to allow fallback to Canvas 2D if GPU fails */
  allowFallback?: boolean;
  /** Whether to use shared instance */
  shared?: boolean;
  /** Whether to auto-resize with canvas */
  autoResize?: boolean;
  /** Frame provider mode ('webview' for Zero-Copy, 'mode-aware' for auto routing) */
  frameProviderMode?: FrameProviderMode;
  /** Callback when basic mode doesn't support the format */
  onBasicModeUnsupported?: (error: BasicModeError) => void;
  /**
   * Mode getter function for mode-aware provider.
   * Required when frameProviderMode is 'mode-aware'.
   */
  getMediaEngineMode?: ModeGetter;
  /**
   * Media request proxy for compatible mode.
   * Required when frameProviderMode is 'mode-aware'.
   */
  mediaProxy?: IMediaRequestProxy;
}

/**
 * Render engine hook interface
 */
export interface RenderEngineHook {
  /** Render state */
  state: RenderEngineState;
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
  /** Set frame server port for compatible mode (WebSocket-based frame delivery) */
  setFrameServerPort: (port: number) => void;
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
  /** Parallel smart preload for multiple tracks */
  smartPreloadMultiTrack: (tracks: Array<{ mediaUrl: string; playhead: number }>, fps?: number) => Promise<void>;
  /** Parallel clearAndPreload for multiple tracks */
  clearAndPreloadMultiTrack: (tracks: Array<{ mediaUrl: string; playhead: number }>, fps?: number) => Promise<void>;
  /** Get buffered duration after playhead */
  getBufferedDurationAfterPlayhead: (mediaUrl: string, playhead: number) => number;
  /** Get minimum buffered duration across multiple tracks */
  getMinBufferedDuration: (tracks: Array<{ mediaUrl: string; playhead: number }>) => number;
  /** Get performance statistics for the last rendered frame */
  getLastFrameStats: () => FramePerformanceStats | null;
  /** Get GPU information and memory stats */
  getGPUStats: () => GPUStats | null;
  /** Switch to a different backend (requires re-initialization) */
  switchBackend: (backend: RenderEngineBackend) => Promise<boolean>;
}

// =============================================================================
// Union type for engines
// =============================================================================

type AnyRenderEngine = GPURenderEngine | Canvas2DRenderEngine;

// =============================================================================
// Hook Implementation
// =============================================================================

export function useRenderEngine(options: RenderEngineOptions = {}): RenderEngineHook {
  const {
    preferredBackend = 'auto',
    allowFallback = true,
    shared = false,
    autoResize = true,
    frameProviderMode = 'webview',
    onBasicModeUnsupported,
    getMediaEngineMode,
    mediaProxy,
  } = options;

  // State
  const [state, setState] = useState<RenderEngineState>({
    isInitialized: false,
    isGPUSupported: false,
    isRendering: false,
    backend: null,
    error: null,
  });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AnyRenderEngine | null>(null);
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const preferredBackendRef = useRef(preferredBackend);
  const frameProviderModeRef = useRef(frameProviderMode);
  const onBasicModeUnsupportedRef = useRef(onBasicModeUnsupported);
  const getMediaEngineModeRef = useRef(getMediaEngineMode);
  const mediaProxyRef = useRef(mediaProxy);

  // Update refs when options change
  useEffect(() => {
    preferredBackendRef.current = preferredBackend;
  }, [preferredBackend]);

  useEffect(() => {
    frameProviderModeRef.current = frameProviderMode;
  }, [frameProviderMode]);

  useEffect(() => {
    onBasicModeUnsupportedRef.current = onBasicModeUnsupported;
  }, [onBasicModeUnsupported]);

  useEffect(() => {
    getMediaEngineModeRef.current = getMediaEngineMode;
  }, [getMediaEngineMode]);

  useEffect(() => {
    mediaProxyRef.current = mediaProxy;
  }, [mediaProxy]);

  // Initialize
  const initialize = useCallback(
    async (canvas?: HTMLCanvasElement): Promise<boolean> => {
      const targetCanvas = canvas || canvasRef.current;
      if (!targetCanvas) {
        console.error('[useRenderEngine] No canvas element provided');
        setState((prev) => ({
          ...prev,
          error: 'No canvas element provided',
        }));
        return false;
      }

      try {
        // Dispose existing engine if any
        if (engineRef.current) {
          engineRef.current.dispose();
          engineRef.current = null;
        }

        // Use factory to create render engine with auto-selection
        const { engine, type } = await createRenderEngine(targetCanvas, {
          preferredBackend: preferredBackendRef.current,
          allowFallback,
          frameProviderOptions: {
            mode: frameProviderModeRef.current,
            onBasicModeUnsupported: onBasicModeUnsupportedRef.current,
            getMediaEngineMode: getMediaEngineModeRef.current,
            mediaProxy: mediaProxyRef.current,
          },
        });

        engineRef.current = engine;
        widthRef.current = engine.width;
        heightRef.current = engine.height;

        const isGPU = type === 'webgpu' || type === 'webgl';

        setState({
          isInitialized: true,
          isGPUSupported: isGPU,
          isRendering: false,
          backend: type,
          error: null,
        });

        return true;
      } catch (err) {
        console.error('[useRenderEngine] Initialization failed:', err);

        // If GPU failed and fallback allowed, try Canvas 2D
        if (
          preferredBackendRef.current !== 'canvas2d' &&
          allowFallback
        ) {
          try {
            const canvas2dEngine = shared
              ? getCanvas2DRenderEngine()
              : new Canvas2DRenderEngine();
            const success = await canvas2dEngine.initialize(targetCanvas);

            if (success) {
              engineRef.current = canvas2dEngine;
              widthRef.current = canvas2dEngine.width;
              heightRef.current = canvas2dEngine.height;

              setState({
                isInitialized: true,
                isGPUSupported: false,
                isRendering: false,
                backend: 'canvas2d',
                error: null,
              });

              return true;
            }
          } catch (fallbackErr) {
            console.error('[useRenderEngine] Canvas 2D fallback failed:', fallbackErr);
          }
        }

        setState({
          isInitialized: false,
          isGPUSupported: false,
          isRendering: false,
          backend: null,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        return false;
      }
    },
    [allowFallback, shared]
  );

  // Resize
  const resize = useCallback(
    (width: number, height: number) => {
      const engine = engineRef.current;
      if (!engine || !state.isInitialized) return;

      if (width !== widthRef.current || height !== heightRef.current) {
        engine.resize(width, height);
        widthRef.current = width;
        heightRef.current = height;
      }
    },
    [state.isInitialized]
  );

  // Dispose
  const dispose = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setState({
      isInitialized: false,
      isGPUSupported: false,
      isRendering: false,
      backend: null,
      error: null,
    });
  }, []);

  // Render frame
  // Note: This method is rarely used directly. Use renderProjectFrame instead.
  // The elements type varies between GPU and Canvas2D engines.
  const renderFrame = useCallback(
    async (elements: RenderableElement[]): Promise<void> => {
      const engine = engineRef.current;
      if (!engine || !state.isInitialized) return;

      setState((prev) => ({ ...prev, isRendering: true }));
      try {
        // Use type assertion since GPURenderableElement and RenderableElement
        // are structurally similar but not identical
        await (engine as Canvas2DRenderEngine).renderFrame(
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
    [state.isInitialized]
  );

  // Render project frame
  const renderProjectFrame = useCallback(
    async (
      project: ProjectData,
      time: number,
      mode: RenderMode = 'preview',
      quality: RenderQuality = 'preview'
    ): Promise<void> => {
      const engine = engineRef.current;
      if (!engine || !state.isInitialized) return;

      setState((prev) => ({ ...prev, isRendering: true }));
      try {
        await engine.renderProjectFrame(project, time, mode, quality);
      } finally {
        setState((prev) => ({ ...prev, isRendering: false }));
      }
    },
    [state.isInitialized]
  );

  // Export to Blob
  const toBlob = useCallback(
    async (type?: string, quality?: number): Promise<Blob | null> => {
      const engine = engineRef.current;
      if (!engine || !state.isInitialized) return null;
      try {
        return await engine.toBlob(type, quality);
      } catch {
        return null;
      }
    },
    [state.isInitialized]
  );

  // Export to ImageBitmap
  const toImageBitmap = useCallback(async (): Promise<ImageBitmap | null> => {
    const engine = engineRef.current;
    if (!engine || !state.isInitialized) return null;
    try {
      return await engine.toImageBitmap();
    } catch {
      return null;
    }
  }, [state.isInitialized]);

  // Set URL resolver for MediaFrameProvider
  const setUrlResolver = useCallback(
    (resolver: ((path: string) => Promise<string>) | undefined) => {
      const engine = engineRef.current;
      if (!engine) {
        console.warn('[useRenderEngine] Cannot set URL resolver: engine not initialized');
        return;
      }
      const frameProvider = engine.frameProvider;
      if (frameProvider && 'setUrlResolver' in frameProvider) {
        (frameProvider as { setUrlResolver: (r: typeof resolver) => void }).setUrlResolver(
          resolver
        );
      }
    },
    []
  );

  // Set frame server port for compatible mode (WebSocket-based frame delivery)
  const setFrameServerPort = useCallback(
    (port: number) => {
      const engine = engineRef.current;
      if (!engine) {
        console.warn('[useRenderEngine] Cannot set frame server port: engine not initialized');
        return;
      }
      // GPURenderEngine has setFrameServerPort method
      if ('setFrameServerPort' in engine) {
        (engine as { setFrameServerPort: (port: number) => void }).setFrameServerPort(port);
        console.log(`[useRenderEngine] Frame server port set to ${port}`);
      }
    },
    []
  );

  // Start GOP preload for a video
  const startPreload = useCallback(
    async (mediaUrl: string, startTime: number, fps?: number): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      const frameProvider = engine.frameProvider;
      if (frameProvider && 'startPreload' in frameProvider) {
        await (
          frameProvider as {
            startPreload: (url: string, time: number, fps?: number) => Promise<void>;
          }
        ).startPreload(mediaUrl, startTime, fps);
      }
    },
    []
  );

  // Stop preload for a video (or all videos)
  const stopPreload = useCallback((mediaUrl?: string): void => {
    const engine = engineRef.current;
    if (!engine) return;

    const frameProvider = engine.frameProvider;
    if (frameProvider && 'stopPreload' in frameProvider) {
      (frameProvider as { stopPreload: (url?: string) => void }).stopPreload(mediaUrl);
    }
  }, []);

  // Get preload status for a video
  const getPreloadStatus = useCallback(
    (mediaUrl: string): {
      preloading: boolean;
      bufferedFrames: number;
      startTime: number | null;
      endTime: number | null;
    } | null => {
      const engine = engineRef.current;
      if (!engine) return null;

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
    []
  );

  // Clear cache and preload first time window (for seek/open)
  const clearAndPreloadFirstWindow = useCallback(
    async (mediaUrl: string, playhead: number, fps?: number): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      const frameProvider = engine.frameProvider;
      if (frameProvider && 'clearAndPreloadFirstWindow' in frameProvider) {
        await (
          frameProvider as {
            clearAndPreloadFirstWindow: (url: string, time: number, fps?: number) => Promise<void>;
          }
        ).clearAndPreloadFirstWindow(mediaUrl, playhead, fps);
      }
    },
    []
  );

  // Smart preload based on buffer status
  const smartPreload = useCallback(
    async (mediaUrl: string, playhead: number, fps?: number): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      const frameProvider = engine.frameProvider;
      if (frameProvider && 'smartPreload' in frameProvider) {
        await (
          frameProvider as {
            smartPreload: (url: string, time: number, fps?: number) => Promise<void>;
          }
        ).smartPreload(mediaUrl, playhead, fps);
      }
    },
    []
  );

  // Get buffered duration after playhead
  const getBufferedDurationAfterPlayhead = useCallback(
    (mediaUrl: string, playhead: number): number => {
      const engine = engineRef.current;
      if (!engine) return 0;

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
    []
  );

  // Multi-track parallel smart preload
  const smartPreloadMultiTrack = useCallback(
    async (tracks: Array<{ mediaUrl: string; playhead: number }>, fps?: number): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      const frameProvider = engine.frameProvider;
      if (frameProvider && 'smartPreloadMultiTrack' in frameProvider) {
        await (
          frameProvider as {
            smartPreloadMultiTrack: (
              tracks: Array<{ mediaUrl: string; playhead: number }>,
              fps?: number
            ) => Promise<void>;
          }
        ).smartPreloadMultiTrack(tracks, fps);
      } else if (frameProvider && 'smartPreload' in frameProvider) {
        // Fallback: parallel serial preload
        const provider = frameProvider as {
          smartPreload: (url: string, time: number, fps?: number) => Promise<void>;
        };
        await Promise.all(tracks.map(t => provider.smartPreload(t.mediaUrl, t.playhead, fps)));
      }
    },
    []
  );

  // Multi-track parallel clearAndPreload
  const clearAndPreloadMultiTrack = useCallback(
    async (tracks: Array<{ mediaUrl: string; playhead: number }>, fps?: number): Promise<void> => {
      const engine = engineRef.current;
      if (!engine) return;

      const frameProvider = engine.frameProvider;
      if (frameProvider && 'clearAndPreloadMultiTrack' in frameProvider) {
        await (
          frameProvider as {
            clearAndPreloadMultiTrack: (
              tracks: Array<{ mediaUrl: string; playhead: number }>,
              fps?: number
            ) => Promise<void>;
          }
        ).clearAndPreloadMultiTrack(tracks, fps);
      } else if (frameProvider && 'clearAndPreloadFirstWindow' in frameProvider) {
        // Fallback: parallel serial preload
        const provider = frameProvider as {
          clearAndPreloadFirstWindow: (url: string, time: number, fps?: number) => Promise<void>;
        };
        await Promise.all(tracks.map(t => provider.clearAndPreloadFirstWindow(t.mediaUrl, t.playhead, fps)));
      }
    },
    []
  );

  // Get minimum buffered duration across multiple tracks
  const getMinBufferedDuration = useCallback(
    (tracks: Array<{ mediaUrl: string; playhead: number }>): number => {
      const engine = engineRef.current;
      if (!engine) return 0;

      const frameProvider = engine.frameProvider;
      if (frameProvider && 'getMinBufferedDuration' in frameProvider) {
        return (
          frameProvider as {
            getMinBufferedDuration: (tracks: Array<{ mediaUrl: string; playhead: number }>) => number;
          }
        ).getMinBufferedDuration(tracks);
      }

      // Fallback: check each track
      if (frameProvider && 'getBufferedDurationAfterPlayhead' in frameProvider) {
        const provider = frameProvider as {
          getBufferedDurationAfterPlayhead: (url: string, time: number) => number;
        };
        let min = Infinity;
        for (const t of tracks) {
          const buffered = provider.getBufferedDurationAfterPlayhead(t.mediaUrl, t.playhead);
          if (buffered < min) min = buffered;
        }
        return min === Infinity ? 0 : min;
      }

      return 0;
    },
    []
  );

  // Switch backend (requires re-initialization)
  const switchBackend = useCallback(
    async (backend: RenderEngineBackend): Promise<boolean> => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return false;
      }

      preferredBackendRef.current = backend;

      // Dispose current engine
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }

      // Re-initialize with new backend
      return initialize(canvas);
    },
    [initialize]
  );

  // Get last frame performance stats
  const getLastFrameStats = useCallback((): FramePerformanceStats | null => {
    const engine = engineRef.current;
    if (!engine) return null;

    // Only GPURenderEngine has lastFrameStats
    if (engine instanceof GPURenderEngine) {
      return engine.lastFrameStats;
    }

    return null;
  }, []);

  // Get GPU stats
  const getGPUStats = useCallback((): GPUStats | null => {
    const engine = engineRef.current;
    if (!engine) return null;

    // Only GPURenderEngine has getGPUStats
    if (engine instanceof GPURenderEngine) {
      return engine.getGPUStats();
    }

    return null;
  }, []);

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
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

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
    setFrameServerPort,
    startPreload,
    stopPreload,
    getPreloadStatus,
    clearAndPreloadFirstWindow,
    smartPreload,
    smartPreloadMultiTrack,
    clearAndPreloadMultiTrack,
    getBufferedDurationAfterPlayhead,
    getMinBufferedDuration,
    getLastFrameStats,
    getGPUStats,
    switchBackend,
  };
}
