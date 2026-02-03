/**
 * GPURenderEngine - GPU based render engine
 * GPU 加速渲染引擎
 *
 * Integrates WebGPU/WebGL compositor with MediaFrameProvider
 * Compatible with Canvas2DRenderEngine interface
 */

import type {
  ProjectData,
  TimelineTrack,
  TimelineElement,
  MediaElement,
  TextElement,
  ShapeElement,
} from '../../types';
import type {
  RectangleShape,
  EllipseShape,
  StarShape,
  LineShape,
  BezierShape,
  PolygonShape,
  ShapeInstance,
} from '../../types/shape';
import { generateStarPoints } from '../../types/shape';
import { isTimeInElement } from '../../types/capabilities';
import type { EffectInstance, EffectParameterValue } from '../../types/effects';
import { getEffectParametersAtTime } from '../../types/effects';
import type { MaskInstance } from '../../types/mask';
import { getComputedMaskAtTime } from '../../types/mask';
import type { ElementTransition, TransitionType, EasingType } from '@uniedit/shared';
import type { IMediaFrameProvider } from '../unified/mediaFrameProvider';
import {
  createWebviewMediaFrameProvider,
  type WebviewMediaFrameProviderConfig,
  type BasicModeError,
  createCompatibleMediaFrameProvider,
  createModeAwareMediaFrameProvider,
  type ModeGetter,
  ModeAwareMediaFrameProvider,
} from '../unified/mediaFrameProvider';
import type { IMediaRequestProxy } from '../../services/MediaRequestProxy';
import { isWebCodecsAvailable } from '../../mediaEngine/decoders/WebviewVideoDecoder';
import type { ICompositor, ITexture, ITransform, ILayer, TextureSource } from './ICompositor';
import { DEFAULT_TRANSFORM, createLayer } from './ICompositor';
import type { BlendModeType, ColorCorrectionParams, GPUTransitionType, TransitionRenderParams } from './types';
import { GPU_TRANSITION_TYPE_MAP } from './types';
import { createCompositor, type CompositorFactoryOptions } from './CompositorFactory';

// Effect Runner integration (from @uniedit/effects-runtime)
import type {
  IEffectRunner,
  IEffectContext,
  EffectInstance as RuntimeEffectInstance,
  EffectType as RuntimeEffectType,
} from '@uniedit/effects-runtime';
import { createWebGPUEffectRunner, isWebGPUSupported } from '@uniedit/effects-runtime';

// =============================================================================
// Types
// =============================================================================

/**
 * Render mode
 */
export type RenderMode = 'preview' | 'export';

/**
 * Render quality
 */
export type RenderQuality = 'preview' | 'final';

/**
 * Render context
 */
export interface GPURenderContext {
  project: ProjectData;
  time: number;
  frameIndex: number;
  width: number;
  height: number;
  fps: number;
  mode: RenderMode;
  quality: RenderQuality;
}

/**
 * Renderable element for GPU rendering
 */
/**
 * Cached frame texture entry (GPU texture cache for video frames)
 * Used to avoid re-uploading the same video frame to GPU repeatedly
 */
interface CachedFrameTexture {
  texture: ITexture;
  mediaUrl: string;
  timestamp: number; // in seconds
  width: number;
  height: number;
  lastAccess: number;
}

export interface GPURenderableElement {
  /** Element ID */
  id: string;
  /** Texture source (will be converted to ITexture) - optional when cachedTexture is provided */
  source?: TextureSource;
  /** Pre-cached GPU texture (from _frameTextureCache) */
  cachedTexture?: ITexture;
  /**
   * VideoFrame for zero-copy external texture rendering (playback mode only).
   * When set, drawLayerWithExternalTexture is used instead of drawLayer.
   * The VideoFrame must be closed after rendering by the caller.
   */
  externalVideoFrame?: VideoFrame;
  /** Transform */
  transform: ITransform;
  /** Opacity (0-1) */
  opacity: number;
  /** Blend mode */
  blendMode: BlendModeType;
  /** Color correction params */
  colorCorrection?: ColorCorrectionParams;
  /** Effect instances to apply */
  effects?: EffectInstance[];
  /** Mask instances to apply */
  masks?: MaskInstance[];
  /** Local time for animation (time relative to element start) */
  localTime?: number;
  /** Z-index for ordering */
  zIndex: number;
  /** Source width */
  sourceWidth?: number;
  /** Source height */
  sourceHeight?: number;
}

/**
 * Frame result
 */
export interface GPUFrameResult {
  /** Frame index */
  frameIndex: number;
  /** Total frames */
  totalFrames: number;
  /** Render time in milliseconds */
  renderTime: number;
  /** ImageData (for preview) */
  imageData?: ImageData;
  /** ImageBitmap (for further processing) */
  imageBitmap?: ImageBitmap;
}

/**
 * Progress callback
 */
export type GPUProgressCallback = (
  frameIndex: number,
  totalFrames: number,
  percent: number
) => void;

/**
 * Active transition info during rendering
 */
export interface ActiveTransition {
  /** The transition definition */
  transition: ElementTransition;
  /** From element ID */
  fromElementId: string;
  /** To element ID */
  toElementId: string;
  /** Transition progress (0-1) */
  progress: number;
  /** From element renderable */
  fromElement?: GPURenderableElement;
  /** To element renderable */
  toElement?: GPURenderableElement;
}

/**
 * Performance statistics for a single frame render
 */
export interface FramePerformanceStats {
  /** Time spent gathering/decoding frames (ms) */
  decodeTime: number;
  /** Time spent compositing layers (ms) */
  compositeTime: number;
  /** Total render time (ms) */
  totalTime: number;
  /** Number of elements rendered */
  elementCount: number;
  /** Number of video frames decoded */
  videoFrameCount: number;
  /** Number of cached frames */
  cachedFrames: number;
  /** Cache hit rate (0-100) */
  cacheHitRate: number;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Number of dropped frames (decode failures) */
  droppedFrames: number;
  /** Number of render errors */
  renderErrors: number;
}

/**
 * GPU information and memory stats
 */
export interface GPUStats {
  /** GPU renderer name */
  renderer: string;
  /** GPU vendor */
  vendor: string;
  /** Estimated VRAM usage in MB (texture cache size) */
  vramUsedMB: number;
  /** Number of cached textures */
  textureCount: number;
  /** Number of cached frame textures */
  frameTextureCount: number;
}

/**
 * Frame provider mode
 * - 'webview': Pure Webview decoding (WebCodecs + mp4box.js), Zero-Copy
 * - 'mode-aware': Automatically routes based on currentMode (basic/compatible)
 *
 * @default 'webview'
 */
export type FrameProviderMode = 'webview' | 'mode-aware';

/**
 * Frame provider options
 */
export interface FrameProviderOptions {
  /**
   * Frame provider mode
   * @default 'webview'
   */
  mode?: FrameProviderMode;
  /** Webview frame provider config */
  webviewConfig?: Omit<WebviewMediaFrameProviderConfig, 'onBasicModeUnsupported'>;
  /**
   * Callback when basic mode doesn't support the format.
   * Use this to prompt the user to switch to compatible mode.
   */
  onBasicModeUnsupported?: (error: BasicModeError) => void;
  /**
   * Mode getter function for mode-aware provider.
   * Returns current media engine mode ('basic' | 'compatible' | null).
   * Required when mode is 'mode-aware'.
   */
  getMediaEngineMode?: ModeGetter;
  /**
   * Media request proxy for compatible mode.
   * Required when mode is 'mode-aware'.
   */
  mediaProxy?: IMediaRequestProxy;
  /**
   * Frame server port for H264 stream mode.
   * When provided, compatible mode will use H264 WebSocket streaming.
   */
  frameServerPort?: number;
  /**
   * Video width for H264 decoder config.
   */
  videoWidth?: number;
  /**
   * Video height for H264 decoder config.
   */
  videoHeight?: number;
}

/**
 * GPU Render Engine options
 */
export interface GPURenderEngineOptions extends CompositorFactoryOptions {
  /** Frame provider options */
  frameProviderOptions?: FrameProviderOptions;
}

// =============================================================================
// GPURenderEngine
// =============================================================================

/**
 * GPU based render engine
 *
 * Uses WebGPU/WebGL for hardware-accelerated compositing
 */
export class GPURenderEngine {
  private _compositor: ICompositor | null = null;
  private _frameProvider: IMediaFrameProvider | null = null;
  private _effectRunner: IEffectRunner | null = null;
  private _isInitialized = false;
  private _disposed = false;
  private _width = 0;
  private _height = 0;

  // Text/shape rendering OffscreenCanvas
  private _textCanvas: OffscreenCanvas | null = null;
  private _textContext: OffscreenCanvasRenderingContext2D | null = null;

  // Texture cache for reusing textures (static: images, text, shapes)
  private _textureCache: Map<string, ITexture> = new Map();

  // Frame texture cache: GPU textures for decoded video frames
  // VideoFrame is uploaded to GPU and immediately closed to release decoder buffers
  private _frameTextureCache: Map<string, CachedFrameTexture> = new Map();
  private _maxFrameTextureCacheSize = 120;

  // Performance statistics for the last frame render
  private _lastFrameStats: FramePerformanceStats = {
    decodeTime: 0,
    compositeTime: 0,
    totalTime: 0,
    elementCount: 0,
    videoFrameCount: 0,
    cachedFrames: 0,
    cacheHitRate: 0,
    cacheHits: 0,
    cacheMisses: 0,
    droppedFrames: 0,
    renderErrors: 0,
  };

  // Cache statistics tracking
  private _cacheHits = 0;
  private _cacheMisses = 0;
  private _droppedFrames = 0;
  private _renderErrors = 0;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the render engine
   */
  async initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: GPURenderEngineOptions
  ): Promise<boolean> {
    if (this._isInitialized) {
      return true;
    }

    try {
      // Create GPU compositor with auto backend selection
      this._compositor = await createCompositor(canvas, {
        preferredBackend: options?.preferredBackend ?? 'auto',
        allowFallback: options?.allowFallback ?? true,
        antialias: options?.antialias ?? false,
        alpha: options?.alpha ?? true,
        preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
        powerPreference: options?.powerPreference ?? 'high-performance',
      });

      this._width = canvas.width;
      this._height = canvas.height;

      // Create media frame provider based on mode
      this._frameProvider = this._createFrameProvider(options);

      // Create text/shape rendering OffscreenCanvas
      this._textCanvas = new OffscreenCanvas(this._width, this._height);
      this._textContext = this._textCanvas.getContext('2d');

      // Initialize effect runner (if WebGPU is available)
      if (this._compositor.backend === 'webgpu' && isWebGPUSupported()) {
        try {
          this._effectRunner = createWebGPUEffectRunner();
          const effectContext = this._createEffectContext();
          await this._effectRunner.initialize(effectContext);
        } catch (error) {
          console.warn('[GPURenderEngine] Effect runner initialization failed, falling back to shader-based effects:', error);
          this._effectRunner = null;
        }
      }

      this._isInitialized = true;

      return true;
    } catch (error) {
      console.error('[GPURenderEngine] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Create frame provider based on options
   *
   * Supports two modes:
   * - 'webview' (default): Uses WebCodecs + mp4box.js for Zero-Copy decoding
   * - 'mode-aware': Routes to WebviewProvider or CompatibleProvider based on currentMode
   *
   * For unsupported formats in webview mode, prompts user to switch to compatible mode.
   */
  private _createFrameProvider(options?: GPURenderEngineOptions): IMediaFrameProvider {
    const fpOptions = options?.frameProviderOptions;
    const mode = fpOptions?.mode ?? 'webview';

    // Create Webview-based frame provider (always needed)
    const webviewProvider = createWebviewMediaFrameProvider({
      ...fpOptions?.webviewConfig,
      onBasicModeUnsupported: fpOptions?.onBasicModeUnsupported,
    });

    // Mode-aware: Create both providers and route based on currentMode
    if (mode === 'mode-aware' && fpOptions?.getMediaEngineMode && fpOptions?.mediaProxy) {
      // Create compatible provider for Extension-based decoding
      // Use H264 stream mode if frameServerPort is provided
      const compatibleProvider = createCompatibleMediaFrameProvider(fpOptions.mediaProxy, {
        frameServerPort: fpOptions.frameServerPort,
        preferredTransport: 'h264Stream',
        videoWidth: fpOptions.videoWidth ?? this._width,
        videoHeight: fpOptions.videoHeight ?? this._height,
      });

      // Create mode-aware provider that routes based on currentMode
      return createModeAwareMediaFrameProvider(
        webviewProvider,
        compatibleProvider,
        fpOptions.getMediaEngineMode
      );
    }

    // Default: Webview-only mode

    // Check WebCodecs availability
    if (!isWebCodecsAvailable()) {
      console.warn(
        '[GPURenderEngine] WebCodecs not available. ' +
        'Please switch to compatible mode for full format support.'
      );
    }

    return webviewProvider;
  }

  /**
   * Resize the render engine
   */
  resize(width: number, height: number): void {
    if (!this._isInitialized || !this._compositor) {
      console.warn('[GPURenderEngine] Cannot resize: not initialized');
      return;
    }

    this._width = width;
    this._height = height;
    this._compositor.resize(width, height);

    // Resize text canvas
    if (this._textCanvas) {
      this._textCanvas.width = width;
      this._textCanvas.height = height;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }

    // Clear frame texture cache first (release back to pool)
    for (const entry of this._frameTextureCache.values()) {
      this._compositor?.releasePooledFrameTexture(entry.texture);
    }
    this._frameTextureCache.clear();

    // Clear texture cache
    for (const texture of this._textureCache.values()) {
      this._compositor?.deleteTexture(texture);
    }
    this._textureCache.clear();

    // Dispose effect runner
    if (this._effectRunner) {
      this._effectRunner.dispose().catch((error: unknown) => {
        console.warn('[GPURenderEngine] Error disposing effect runner:', error);
      });
      this._effectRunner = null;
    }

    // Dispose compositor
    this._compositor?.dispose();
    this._compositor = null;

    // Dispose frame provider
    this._frameProvider?.dispose();
    this._frameProvider = null;

    // Clear text canvas
    this._textCanvas = null;
    this._textContext = null;

    this._isInitialized = false;
    this._disposed = true;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /**
   * Whether the engine is initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Canvas width
   */
  get width(): number {
    return this._width;
  }

  /**
   * Canvas height
   */
  get height(): number {
    return this._height;
  }

  /**
   * Get current backend type
   */
  get backend(): 'webgpu' | 'webgl' | null {
    return this._compositor?.backend ?? null;
  }

  /**
   * Get compositor instance (for advanced usage like async pixel reading)
   */
  get compositor(): ICompositor | null {
    return this._compositor;
  }

  /**
   * Get frame provider
   */
  get frameProvider(): IMediaFrameProvider | null {
    return this._frameProvider;
  }

  /**
   * Get performance statistics for the last rendered frame
   */
  get lastFrameStats(): FramePerformanceStats {
    return { ...this._lastFrameStats };
  }

  /**
   * Get GPU information and memory stats
   */
  getGPUStats(): GPUStats {
    const stats: GPUStats = {
      renderer: 'Unknown',
      vendor: 'Unknown',
      vramUsedMB: 0,
      textureCount: this._textureCache.size,
      frameTextureCount: this._frameTextureCache.size,
    };

    if (!this._compositor) return stats;

    // Try to get GPU info from WebGL context
    const gl = this._compositor.nativeContext;
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        stats.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
        stats.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
      }
    }

    // Estimate VRAM usage from texture caches
    let totalBytes = 0;

    // Static texture cache (images, text, shapes)
    for (const texture of this._textureCache.values()) {
      // Assume RGBA8 format (4 bytes per pixel)
      totalBytes += texture.width * texture.height * 4;
    }

    // Frame texture cache (video frames)
    for (const entry of this._frameTextureCache.values()) {
      totalBytes += entry.width * entry.height * 4;
    }

    stats.vramUsedMB = Math.round(totalBytes / 1024 / 1024 * 10) / 10;

    return stats;
  }

  /**
   * Set frame provider
   */
  setFrameProvider(provider: IMediaFrameProvider): void {
    this._frameProvider = provider;
  }

  /**
   * Set frame server port for compatible mode
   * Enables high-performance H264 WebSocket streaming
   */
  setFrameServerPort(port: number): void {
    if (this._frameProvider && this._frameProvider instanceof ModeAwareMediaFrameProvider) {
      // Set video dimensions first (use current render engine dimensions)
      this._frameProvider.setVideoDimensions(this._width, this._height);
      // Then set port (this will initialize H264 client)
      this._frameProvider.setFrameServerPort(port);
      console.log(`[GPURenderEngine] Frame server port set to ${port}, H264 stream mode enabled`);
    } else {
      console.warn('[GPURenderEngine] Cannot set frame server port: provider is not ModeAwareMediaFrameProvider');
    }
  }

  /**
   * Clear and preload first window of frames for a video
   * Used for export optimization
   */
  async clearAndPreloadFirstWindow(
    mediaUrl: string,
    playhead: number,
    fps?: number
  ): Promise<void> {
    if (!this._frameProvider) return;
    // MediaFrameProvider has this method but it's not in IMediaFrameProvider interface
    // Use type assertion to access it
    const provider = this._frameProvider as {
      clearAndPreloadFirstWindow?: (url: string, playhead: number, fps?: number) => Promise<void>;
    };
    if (provider.clearAndPreloadFirstWindow) {
      await provider.clearAndPreloadFirstWindow(mediaUrl, playhead, fps);
    }
  }

  /**
   * Smart preload frames for continuous playback
   * Used for export optimization
   */
  async smartPreload(
    mediaUrl: string,
    playhead: number,
    fps?: number
  ): Promise<void> {
    if (!this._frameProvider) return;
    // MediaFrameProvider has this method but it's not in IMediaFrameProvider interface
    const provider = this._frameProvider as {
      smartPreload?: (url: string, playhead: number, fps?: number) => Promise<void>;
    };
    if (provider.smartPreload) {
      await provider.smartPreload(mediaUrl, playhead, fps);
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Render a single frame with elements
   */
  async renderFrame(
    _context: GPURenderContext,
    elements: GPURenderableElement[]
  ): Promise<void> {
    if (!this._isInitialized || !this._compositor) {
      console.warn('[GPURenderEngine] Cannot render: not initialized');
      return;
    }

    console.log(`[GPURenderEngine] renderFrame: ${elements.length} elements`);

    // Begin frame
    this._compositor.beginFrame();

    // Sort elements by z-index
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

    // Separate elements into zero-copy batch and standard path
    const zeroCopyElements: Array<{
      element: GPURenderableElement;
      layer: Omit<ILayer, 'texture'>;
      videoFrame: VideoFrame;
    }> = [];
    const standardElements: GPURenderableElement[] = [];

    for (const element of sortedElements) {
      const hasEffects = element.effects && element.effects.length > 0;
      if (
        element.externalVideoFrame &&
        !hasEffects &&
        this._compositor.drawLayersWithExternalTextures
      ) {
        // Collect for batch zero-copy rendering
        const processedMasks = this._processMasks(element);
        zeroCopyElements.push({
          element,
          layer: {
            transform: element.transform,
            opacity: element.opacity,
            blendMode: element.blendMode,
            colorCorrection: element.colorCorrection,
            masks: processedMasks,
          },
          videoFrame: element.externalVideoFrame,
        });
      } else {
        standardElements.push(element);
      }
    }

    // Batch render all zero-copy elements in one submit (if any)
    if (zeroCopyElements.length > 0 && this._compositor.drawLayersWithExternalTextures) {
      this._compositor.drawLayersWithExternalTextures(
        zeroCopyElements.map(({ layer, videoFrame }) => ({ layer, videoFrame }))
      );

      // Close VideoFrames after batch rendering
      for (const { element } of zeroCopyElements) {
        element.externalVideoFrame?.close();
        element.externalVideoFrame = undefined;
      }
    }

    // Draw remaining elements using standard path
    for (const element of standardElements) {
      await this._drawElement(element);
    }

    // End frame
    this._compositor.endFrame();

    // Clean up temporary textures
    this._cleanupTemporaryTextures(sortedElements);

    // Clear effect parameters cache
    this._clearEffectParamsCache();
  }

  /**
   * Render a frame with transition support
   * This method handles transitions between elements during compositing
   */
  private async _renderFrameWithTransitions(
    context: GPURenderContext,
    elements: GPURenderableElement[],
    activeTransitions: Map<number, ActiveTransition[]>
  ): Promise<void> {
    if (!this._isInitialized || !this._compositor) {
      console.warn('[GPURenderEngine] Cannot render: not initialized');
      return;
    }

    // If no transitions, use standard rendering path
    if (activeTransitions.size === 0) {
      await this.renderFrame(context, elements);
      return;
    }

    // Begin frame
    this._compositor.beginFrame();

    // Sort elements by z-index
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

    // Track which elements are part of active transitions
    const transitionElementIds = new Set<string>();
    for (const transitions of activeTransitions.values()) {
      for (const t of transitions) {
        transitionElementIds.add(t.fromElementId);
        transitionElementIds.add(t.toElementId);
      }
    }

    // Draw elements, handling transitions
    for (const element of sortedElements) {
      // Skip elements that are part of an active transition - they'll be rendered via transition
      if (transitionElementIds.has(element.id)) {
        // Check if this element is the "to" element in a transition
        // If so, render the transition here (at its z-index position)
        for (const [_trackIndex, transitions] of activeTransitions) {
          for (const activeTransition of transitions) {
            if (activeTransition.toElementId === element.id) {
              await this._drawTransition(activeTransition);
            }
          }
        }
        continue;
      }

      // Draw regular element
      await this._drawElement(element);
    }

    // End frame
    this._compositor.endFrame();

    // Clean up temporary textures
    this._cleanupTemporaryTextures(sortedElements);

    // Clear effect parameters cache
    this._clearEffectParamsCache();
  }

  /**
   * Draw a transition between two elements
   */
  private async _drawTransition(activeTransition: ActiveTransition): Promise<void> {
    if (!this._compositor) return;

    const { fromElement, toElement, progress } = activeTransition;

    // Both elements must be available
    if (!fromElement || !toElement) {
      console.debug(
        `[GPURenderEngine] Cannot render transition: missing from or to element`,
        {
          fromId: activeTransition.fromElementId,
          toId: activeTransition.toElementId,
          hasFrom: !!fromElement,
          hasTo: !!toElement,
        }
      );
      // Fall back to drawing the element that is available
      if (progress < 0.5 && fromElement) {
        await this._drawElement(fromElement);
      } else if (toElement) {
        await this._drawElement(toElement);
      }
      return;
    }

    // Get or create textures for both elements (prefer cachedTexture)
    const fromTexture = fromElement.cachedTexture ?? (fromElement.source ? this._getOrCreateTexture(fromElement.id, fromElement.source) : null);
    const toTexture = toElement.cachedTexture ?? (toElement.source ? this._getOrCreateTexture(toElement.id, toElement.source) : null);

    if (!fromTexture || !toTexture) {
      console.warn('[GPURenderEngine] Cannot render transition: failed to create textures');
      // Fall back to the dominant element
      if (progress < 0.5 && fromTexture) {
        await this._drawElement(fromElement);
      } else if (toTexture) {
        await this._drawElement(toElement);
      }
      return;
    }

    // Apply effects to both elements first (if any)
    const [fromEffectResult, toEffectResult] = await Promise.all([
      this._applyEffects(fromElement, fromTexture),
      this._applyEffects(toElement, toTexture),
    ]);

    // Render the transition
    const transitionResult = this._renderTransition(
      fromEffectResult.texture,
      toEffectResult.texture,
      activeTransition
    );

    if (transitionResult) {
      // Draw the transition result to canvas using the "to" element's transform and properties
      const layer = createLayer({
        texture: transitionResult,
        transform: toElement.transform,
        opacity: toElement.opacity,
        blendMode: toElement.blendMode,
        // Don't apply color correction here - it was already applied in effect processing
      });

      this._compositor.drawLayer(layer);

      // Cleanup transition texture if needed
      this._compositor.deleteTexture(transitionResult);
    } else {
      // Fallback: simple crossfade by adjusting opacity
      console.debug('[GPURenderEngine] Transition fallback: using simple crossfade');

      // Draw from element with decreasing opacity
      const fromLayer = createLayer({
        texture: fromEffectResult.texture,
        transform: fromElement.transform,
        opacity: fromElement.opacity * (1 - progress),
        blendMode: fromElement.blendMode,
        colorCorrection: fromElement.colorCorrection,
      });
      this._compositor.drawLayer(fromLayer);

      // Draw to element with increasing opacity
      const toLayer = createLayer({
        texture: toEffectResult.texture,
        transform: toElement.transform,
        opacity: toElement.opacity * progress,
        blendMode: toElement.blendMode,
        colorCorrection: toElement.colorCorrection,
      });
      this._compositor.drawLayer(toLayer);
    }

    // Cleanup effect textures if needed
    if (fromEffectResult.needsCleanup) {
      this._compositor.deleteTexture(fromEffectResult.texture);
    }
    if (toEffectResult.needsCleanup) {
      this._compositor.deleteTexture(toEffectResult.texture);
    }
  }

  /**
   * Render a project frame at a specific time
   * @param project Project data
   * @param time Time in seconds
   * @param mode Render mode ('preview' or 'export')
   * @param quality Render quality ('preview' or 'final')
   * @param usePreloadBuffer If true, use preload buffer even in export mode (for optimized export)
   */
  async renderProjectFrame(
    project: ProjectData,
    time: number,
    mode: RenderMode = 'preview',
    quality: RenderQuality = 'preview',
    usePreloadBuffer = false
  ): Promise<void> {
    const totalStart = performance.now();

    if (!this._isInitialized || !this._compositor) {
      console.warn('[GPURenderEngine] Cannot render: not initialized');
      return;
    }

    const fps = project.fps || 30;
    const frameIndex = Math.floor(time * fps);

    const context: GPURenderContext = {
      project,
      time,
      frameIndex,
      width: this._width,
      height: this._height,
      fps,
      mode,
      quality,
    };

    // Non-blocking mode:
    // - Preview playback: always non-blocking (use cached frames)
    // - Export with usePreloadBuffer: non-blocking (use preloaded frames)
    // - Export without usePreloadBuffer: blocking (wait for each frame)
    const nonBlocking = (mode === 'preview' && quality === 'preview') || usePreloadBuffer;

    // Gather renderable elements (includes decoding)
    const decodeStart = performance.now();
    const elements = await this._gatherRenderableElements(context, nonBlocking);
    const decodeTime = performance.now() - decodeStart;

    // Debug: log element count
    console.log(`[GPURenderEngine] renderProjectFrame: gathered ${elements.length} elements, nonBlocking=${nonBlocking}`);

    // Count video frames
    let videoFrameCount = 0;
    for (const el of elements) {
      if (el.externalVideoFrame || el.cachedTexture) {
        videoFrameCount++;
      }
    }

    // Detect active transitions
    const activeTransitions = this._getActiveTransitions(project, time, elements);

    // Render frame with transition support (compositing)
    const compositeStart = performance.now();
    await this._renderFrameWithTransitions(context, elements, activeTransitions);
    const compositeTime = performance.now() - compositeStart;

    // Calculate cache hit rate
    const totalCacheAccess = this._cacheHits + this._cacheMisses;
    const cacheHitRate = totalCacheAccess > 0
      ? Math.round((this._cacheHits / totalCacheAccess) * 100)
      : 0;

    // Get cached frames count from frame provider
    const cachedFrames = this._frameProvider?.getCachedFrameCount?.() ?? 0;

    // Update performance stats
    this._lastFrameStats = {
      decodeTime,
      compositeTime,
      totalTime: performance.now() - totalStart,
      elementCount: elements.length,
      videoFrameCount,
      cachedFrames,
      cacheHitRate,
      cacheHits: this._cacheHits,
      cacheMisses: this._cacheMisses,
      droppedFrames: this._droppedFrames,
      renderErrors: this._renderErrors,
    };
  }

  /**
   * Draw a single element
   */
  private async _drawElement(element: GPURenderableElement): Promise<void> {
    if (!this._compositor) return;

    // ZERO-COPY PATH: Use external texture for VideoFrame during playback
    // This avoids the VideoFrame → GPUTexture pixel copy
    // NOTE: Only use zero-copy when there are no effects to apply,
    // since effects require a GPU texture to process
    const hasEffects = element.effects && element.effects.length > 0;

    if (element.externalVideoFrame && !hasEffects) {
      // Check if compositor supports external texture (WebGPU only)
      if (this._compositor.drawLayerWithExternalTexture) {
        // Process masks if any
        const processedMasks = this._processMasks(element);

        // Draw using external texture (zero-copy)
        this._compositor.drawLayerWithExternalTexture(
          {
            transform: element.transform,
            opacity: element.opacity,
            blendMode: element.blendMode,
            colorCorrection: element.colorCorrection,
            masks: processedMasks,
          },
          element.externalVideoFrame
        );

        // Close VideoFrame after rendering (ownership transferred to us)
        element.externalVideoFrame.close();
        element.externalVideoFrame = undefined;
        return;
      }
    }

    // FALLBACK: Convert externalVideoFrame to texture if present
    // This happens when:
    // 1. Compositor doesn't support external texture (WebGL)
    // 2. Element has effects that need GPU texture processing
    if (element.externalVideoFrame) {
      const texture = this._compositor.createTexture(element.externalVideoFrame);
      element.externalVideoFrame.close();
      element.externalVideoFrame = undefined;

      if (!texture) {
        console.warn(`[GPURenderEngine] Failed to create texture for element ${element.id}`);
        return;
      }

      element.cachedTexture = texture;
    }

    // STANDARD PATH: Use pre-cached GPU texture or create from source
    let texture: ITexture | null = element.cachedTexture ?? null;

    // Fallback: create texture from source (images, text, shapes)
    if (!texture && element.source) {
      texture = this._getOrCreateTexture(element.id, element.source);
    }

    if (!texture) {
      console.warn(`[GPURenderEngine] No texture for element ${element.id}`);
      return;
    }

    // Apply effects chain (if any)
    // This processes effects and may return a modified texture
    const effectResult = await this._applyEffects(element, texture);
    texture = effectResult.texture;

    // Process masks (resolve animations, prepare for compositor)
    const processedMasks = this._processMasks(element);

    // Create layer with potentially modified texture and masks
    const layer = createLayer({
      texture,
      transform: element.transform,
      opacity: element.opacity,
      blendMode: element.blendMode,
      colorCorrection: element.colorCorrection,
      masks: processedMasks,
    });

    // Draw layer
    this._compositor.drawLayer(layer);

    // Cleanup effect-generated texture if needed
    if (effectResult.needsCleanup && texture !== effectResult.texture) {
      this._compositor.deleteTexture(effectResult.texture);
    }
  }

  /**
   * Get or create texture from source
   */
  private _getOrCreateTexture(id: string, source: TextureSource): ITexture | null {
    if (!this._compositor) return null;

    // For VideoFrame sources, always create new texture (they change each frame)
    if (source instanceof VideoFrame) {
      const texture = this._compositor.createTexture(source);
      if (texture) {
        // Store temporarily for cleanup
        this._textureCache.set(`temp_${id}_${Date.now()}`, texture);
      }
      return texture;
    }

    // For static sources, try to reuse cached texture
    const cached = this._textureCache.get(id);
    if (cached) {
      // Update texture content for ImageBitmap (might have changed)
      if (source instanceof ImageBitmap) {
        this._compositor.updateTexture(cached, source);
      }
      return cached;
    }

    // Create new texture
    const texture = this._compositor.createTexture(source);
    if (texture) {
      this._textureCache.set(id, texture);
    }
    return texture;
  }

  // -------------------------------------------------------------------------
  // Frame Texture Cache (GPU texture cache for video frames)
  // -------------------------------------------------------------------------

  /**
   * Generate cache key for frame texture (quantized to 1ms precision)
   */
  private _getFrameTextureCacheKey(mediaUrl: string, timestamp: number): string {
    const quantized = Math.round(timestamp * 1000);
    return `frame:${mediaUrl}:${quantized}`;
  }

  /**
   * Get cached frame texture, updating last access time
   */
  private _getCachedFrameTexture(key: string): CachedFrameTexture | null {
    const entry = this._frameTextureCache.get(key);
    if (entry) {
      entry.lastAccess = performance.now();
      return entry;
    }
    return null;
  }

  /**
   * Cache a frame texture and trigger eviction if needed
   */
  private _cacheFrameTexture(
    key: string,
    texture: ITexture,
    mediaUrl: string,
    timestamp: number,
    width: number,
    height: number
  ): void {
    this._frameTextureCache.set(key, {
      texture,
      mediaUrl,
      timestamp,
      width,
      height,
      lastAccess: performance.now(),
    });
    this._evictOldFrameTextures();
  }

  /**
   * LRU eviction for frame texture cache
   */
  private _evictOldFrameTextures(): void {
    while (this._frameTextureCache.size > this._maxFrameTextureCacheSize) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [key, entry] of this._frameTextureCache.entries()) {
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const entry = this._frameTextureCache.get(oldestKey);
        if (entry) {
          // Release pooled texture back to pool (for reuse, not destruction)
          this._compositor?.releasePooledFrameTexture(entry.texture);
        }
        this._frameTextureCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Cleanup temporary textures after rendering
   */
  private _cleanupTemporaryTextures(elements: GPURenderableElement[]): void {
    if (!this._compositor) return;

    // Find and delete temporary textures (but NOT frame texture cache entries)
    const toDelete: string[] = [];
    for (const [key, texture] of this._textureCache.entries()) {
      if (key.startsWith('temp_')) {
        this._compositor.deleteTexture(texture);
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this._textureCache.delete(key);
    }

    // Close VideoFrame sources — only for non-cached elements
    // Cached video frames are already closed in _getElementMediaSource after GPU upload
    for (const element of elements) {
      if (element.source instanceof VideoFrame) {
        element.source.close();
      }
      // Note: element.cachedTexture is managed by _frameTextureCache, don't delete here
    }
  }

  // -------------------------------------------------------------------------
  // Element Gathering
  // -------------------------------------------------------------------------

  /**
   * Gather renderable elements from project at current time
   */
  private async _gatherRenderableElements(
    context: GPURenderContext,
    nonBlocking: boolean
  ): Promise<GPURenderableElement[]> {
    const { project, time } = context;
    const elements: GPURenderableElement[] = [];

    if (!project.tracks || !this._frameProvider) {
      console.warn(`[GPURenderEngine] _gatherRenderableElements: no tracks or no frameProvider (tracks=${!!project.tracks}, frameProvider=${!!this._frameProvider})`);
      return elements;
    }

    // Collect all visible elements from all tracks
    const promises: Promise<GPURenderableElement | null>[] = [];

    for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
      const track = project.tracks[trackIndex];
      if (!track?.elements) continue;

      // Skip hidden tracks
      if (track.hidden) continue;

      for (const element of track.elements) {
        if (!element) continue;

        // Check if element is visible at current time
        if (!isTimeInElement(element, time)) {
          continue;
        }

        // Create promise for element processing
        // Note: trackIndex is used as z-index in _elementToRenderableElement
        promises.push(
          this._elementToRenderableElement(element, track, trackIndex, time, nonBlocking)
        );
      }
    }

    // Wait for all elements
    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        elements.push(result.value);
      }
    }

    return elements;
  }

  /**
   * Convert a timeline element to a renderable element
   */
  private async _elementToRenderableElement(
    element: TimelineElement,
    track: TimelineTrack,
    trackIndex: number,
    time: number,
    nonBlocking: boolean
  ): Promise<GPURenderableElement | null> {
    // Get media source
    const mediaResult = await this._getElementMediaSource(element, time, nonBlocking);
    if (!mediaResult) {
      return null;
    }

    // Calculate local time for animations
    const localTime = time - element.startTime;

    // Calculate transform
    const transform = this._calculateTransform(element, time);

    // Calculate opacity
    const opacity = this._calculateOpacity(element, track, time);

    // Get color correction
    const colorCorrection = this._getColorCorrection(element);

    // Get effects
    const effects = this._getEffects(element);

    // Get masks
    const masks = this._getMasks(element);

    // Get blend mode
    const blendMode = (element.blendMode as BlendModeType) ?? 'normal';

    return {
      id: element.id,
      source: mediaResult.source,
      cachedTexture: mediaResult.cachedTexture,
      externalVideoFrame: mediaResult.externalVideoFrame,
      transform,
      opacity,
      blendMode,
      colorCorrection,
      effects,
      masks,
      localTime,
      zIndex: trackIndex,
      sourceWidth: mediaResult.width,
      sourceHeight: mediaResult.height,
    };
  }

  /**
   * Get media source for an element
   * For video: uses hybrid mode:
   *   - nonBlocking=true (playback): return VideoFrame for zero-copy external texture
   *   - nonBlocking=false (export): upload to GPU texture and cache
   */
  private async _getElementMediaSource(
    element: TimelineElement,
    time: number,
    nonBlocking: boolean
  ): Promise<{
    source?: TextureSource;
    cachedTexture?: ITexture;
    externalVideoFrame?: VideoFrame;
    width: number;
    height: number;
  } | null> {
    if (!this._frameProvider) return null;

    const localTime = time - element.startTime;

    switch (element.type) {
      case 'media': {
        const mediaElement = element as MediaElement;
        const src = mediaElement.src;
        const ext = src.split('.').pop()?.toLowerCase() ?? '';

        // Video extensions
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'];
        // Image extensions
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

        if (videoExtensions.includes(ext)) {
          // Video: hybrid mode based on nonBlocking flag
          const sourceTime = localTime + element.trimStart;

          // Check GPU texture cache first (for both modes)
          const cacheKey = this._getFrameTextureCacheKey(src, sourceTime);
          const cached = this._getCachedFrameTexture(cacheKey);
          if (cached) {
            // Cache hit
            this._cacheHits++;
            return {
              cachedTexture: cached.texture,
              width: cached.width,
              height: cached.height,
            };
          }

          // Cache miss — get VideoFrame from provider
          this._cacheMisses++;
          const frame = await this._frameProvider.getVideoFrame(
            element.id,
            src,
            sourceTime,
            nonBlocking
          );

          if (!frame) {
            // Decode failure - dropped frame
            this._droppedFrames++;
            return null;
          }

          const width = frame.displayWidth;
          const height = frame.displayHeight;

          // HYBRID MODE DECISION:
          // nonBlocking=true means playback mode (frame changes each render)
          //   → Return VideoFrame for zero-copy external texture rendering
          //   → Frame will be closed by _drawElement after rendering
          // nonBlocking=false means export/scrubbing mode (may need cache)
          //   → Upload to GPU texture and cache for potential re-renders
          if (nonBlocking) {
            // PLAYBACK MODE: Return VideoFrame for zero-copy external texture
            // VideoFrame ownership transfers to caller (closed after rendering)
            return {
              externalVideoFrame: frame,
              width,
              height,
            };
          } else {
            // EXPORT/SCRUBBING MODE: Upload to GPU and cache
            const texture = this._compositor?.acquirePooledFrameTexture(
              frame.displayWidth,
              frame.displayHeight,
              frame
            );
            if (!texture) {
              frame.close();
              return null;
            }

            // Cache the GPU texture
            this._cacheFrameTexture(cacheKey, texture, src, sourceTime, width, height);

            // Close VideoFrame immediately to release decoder buffer
            frame.close();

            return { cachedTexture: texture, width, height };
          }
        }

        if (imageExtensions.includes(ext)) {
          // Image: get ImageBitmap
          const bitmap = await this._frameProvider.getImageBitmap(element.id, src);
          if (!bitmap) return null;

          return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
          };
        }

        return null;
      }

      case 'text': {
        const textElement = element as TextElement;
        const bitmap = await this._renderTextToCanvas(textElement);
        if (!bitmap) return null;

        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        };
      }

      case 'shape': {
        const shapeElement = element as ShapeElement;
        const bitmap = await this._renderShapeToCanvas(shapeElement);
        if (!bitmap) return null;

        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        };
      }

      case 'audio':
        // Audio has no visual output
        return null;

      default:
        return null;
    }
  }

  /**
   * Calculate transform for element at current time
   */
  private _calculateTransform(element: TimelineElement, time: number): ITransform {
    const localTime = time - element.startTime;

    // Check for animated transform
    if (element.animTransform) {
      return {
        x: this._interpolateProperty(element.animTransform.x, localTime) ?? 0.5,
        y: this._interpolateProperty(element.animTransform.y, localTime) ?? 0.5,
        scaleX: this._interpolateProperty(element.animTransform.scaleX, localTime) ?? 1,
        scaleY: this._interpolateProperty(element.animTransform.scaleY, localTime) ?? 1,
        rotation: this._interpolateProperty(element.animTransform.rotation, localTime) ?? 0,
        anchorX: element.transform?.anchorX ?? 0.5,
        anchorY: element.transform?.anchorY ?? 0.5,
      };
    }

    // Use static transform
    if (element.transform) {
      return {
        x: element.transform.x ?? 0.5,
        y: element.transform.y ?? 0.5,
        scaleX: element.transform.scaleX ?? 1,
        scaleY: element.transform.scaleY ?? 1,
        rotation: element.transform.rotation ?? 0,
        anchorX: element.transform.anchorX ?? 0.5,
        anchorY: element.transform.anchorY ?? 0.5,
      };
    }

    return { ...DEFAULT_TRANSFORM };
  }

  /**
   * Calculate opacity for element at current time
   */
  private _calculateOpacity(element: TimelineElement, _track: TimelineTrack, time: number): number {
    const localTime = time - element.startTime;

    // Check for animated opacity
    if (element.animTransform?.opacity) {
      return this._interpolateProperty(element.animTransform.opacity, localTime) ?? 1;
    }

    return element.opacity ?? 1;
  }

  /**
   * Get color correction parameters for element
   */
  private _getColorCorrection(element: TimelineElement): ColorCorrectionParams | undefined {
    if (element.type !== 'media') return undefined;

    const mediaElement = element as MediaElement;
    const cc = mediaElement.colorCorrection;
    if (!cc || !cc.enabled) return undefined;

    // Extract from nested basic structure
    const basic = cc.basic;
    return {
      exposure: basic.exposure ?? 0,
      contrast: basic.contrast ?? 0,
      saturation: basic.saturation ?? 0,
      temperature: basic.temperature ?? 0,
      tint: basic.tint ?? 0,
      vibrance: basic.vibrance ?? 0,
      highlights: basic.highlights ?? 0,
      shadows: basic.shadows ?? 0,
      whites: basic.whites ?? 0,
      blacks: basic.blacks ?? 0,
    };
  }

  /**
   * Get effects array from element
   */
  private _getEffects(element: TimelineElement): EffectInstance[] | undefined {
    // Effects capability is defined in capabilities.ts and can be on any element
    const effectsCapable = element as TimelineElement & { effects?: EffectInstance[] };
    const effects = effectsCapable.effects;

    if (!effects || effects.length === 0) {
      return undefined;
    }

    // Filter enabled effects and sort by order
    const enabledEffects = effects
      .filter((e) => e.enabled)
      .sort((a, b) => a.order - b.order);

    return enabledEffects.length > 0 ? enabledEffects : undefined;
  }

  /**
   * Get masks array from element
   */
  private _getMasks(element: TimelineElement): MaskInstance[] | undefined {
    // Masks capability is defined in capabilities.ts and can be on any element
    const masksCapable = element as TimelineElement & { masks?: MaskInstance[] };
    const masks = masksCapable.masks;

    if (!masks || masks.length === 0) {
      return undefined;
    }

    // Filter enabled masks and sort by order
    const enabledMasks = masks
      .filter((m) => m.enabled)
      .sort((a, b) => a.order - b.order);

    return enabledMasks.length > 0 ? enabledMasks : undefined;
  }

  // -------------------------------------------------------------------------
  // Effects Processing (Phase 3)
  // -------------------------------------------------------------------------

  /**
   * Apply effects chain to an element
   * Returns the processed texture (or original if no effects)
   *
   * This is a simplified implementation that processes effects in the following way:
   * 1. For effects that modify alpha (chroma-key, luma-key): apply to source
   * 2. For effects that modify color/blur: apply in order
   *
   * Note: Full multi-pass rendering with FBO ping-pong would be needed for
   * complex effect chains. This implementation handles common cases.
   *
   * When IEffectRunner is available (WebGPU backend), effects are processed
   * via compute shaders for zero-copy texture processing.
   */
  private async _applyEffects(
    element: GPURenderableElement,
    sourceTexture: ITexture
  ): Promise<{ texture: ITexture; needsCleanup: boolean }> {
    const effects = element.effects;
    const localTime = element.localTime ?? 0;

    // No effects to apply
    if (!effects || effects.length === 0) {
      return { texture: sourceTexture, needsCleanup: false };
    }

    // Filter to only supported effects (check both runner and legacy support)
    const supportedEffects = effects.filter((e) => this._isEffectSupportedByAny(e.type));

    if (supportedEffects.length === 0) {
      // Log unsupported effects for debugging
      const unsupported = effects.filter((e) => !this._isEffectSupportedByAny(e.type));
      if (unsupported.length > 0) {
        console.debug(
          `[GPURenderEngine] Unsupported effects skipped for element ${element.id}:`,
          unsupported.map((e) => e.type)
        );
      }
      return { texture: sourceTexture, needsCleanup: false };
    }

    // Try to use IEffectRunner for GPU-accelerated effect processing
    if (this._effectRunner?.isReady) {
      try {
        // Convert effects to RuntimeEffectInstance format expected by IEffectRunner
        const effectInstances: RuntimeEffectInstance[] = supportedEffects.map((effect, index) => ({
          id: effect.id ?? `${element.id}_effect_${index}`,
          effectId: effect.type,
          clipId: element.id,
          type: effect.type as RuntimeEffectType,
          order: effect.order ?? index,
          enabled: effect.enabled ?? true,
          params: getEffectParametersAtTime(effect, localTime),
        }));

        console.debug(
          `[GPURenderEngine] Running ${effectInstances.length} effects via IEffectRunner for element ${element.id}`
        );

        const result = await this._effectRunner.run(sourceTexture, effectInstances, localTime);

        return {
          texture: result.texture,
          needsCleanup: result.isNewTexture,
        };
      } catch (error) {
        console.warn(
          `[GPURenderEngine] IEffectRunner failed for element ${element.id}, falling back to shader uniforms:`,
          error
        );
        // Fall through to legacy shader-based approach
      }
    }

    // Legacy fallback: store effect parameters for shader uniforms
    console.debug(
      `[GPURenderEngine] Processing ${supportedEffects.length} effects via shader uniforms for element ${element.id}:`,
      supportedEffects.map((e) => e.type)
    );

    for (const effect of supportedEffects) {
      const params = getEffectParametersAtTime(effect, localTime);

      // Process color parameters (convert hex to RGB)
      const processedParams = { ...params };
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.startsWith('#')) {
          // Convert color string to array
          const rgb = this._parseColor(value);
          processedParams[`${key}R`] = rgb[0];
          processedParams[`${key}G`] = rgb[1];
          processedParams[`${key}B`] = rgb[2];
        }
      }

      this._storeEffectParams(element.id, effect.type, processedParams);
    }

    // Return original texture - effects will be applied in _drawElement via shader uniforms
    return { texture: sourceTexture, needsCleanup: false };
  }

  /**
   * Check if effect is supported by either IEffectRunner or legacy shader
   */
  private _isEffectSupportedByAny(effectType: string): boolean {
    // Check IEffectRunner first
    if (this._effectRunner?.isEffectSupported(effectType)) {
      return true;
    }
    // Fall back to legacy support check
    return this._isEffectSupported(effectType);
  }

  /**
   * Effect parameters cache for passing to shaders
   * Key: elementId_effectType, Value: computed parameters
   */
  private _effectParamsCache = new Map<string, Record<string, EffectParameterValue>>();

  /**
   * Store computed effect parameters for shader access
   */
  private _storeEffectParams(
    elementId: string,
    effectType: string,
    params: Record<string, EffectParameterValue>
  ): void {
    const key = `${elementId}_${effectType}`;
    this._effectParamsCache.set(key, params);
  }

  /**
   * Get stored effect parameters (for use by compositor/shaders)
   * @public Exposed for future compositor integration
   */
  getStoredEffectParams(
    elementId: string,
    effectType: string
  ): Record<string, EffectParameterValue> | undefined {
    const key = `${elementId}_${effectType}`;
    return this._effectParamsCache.get(key);
  }

  /**
   * Clear effect parameters cache (called after each frame)
   */
  private _clearEffectParamsCache(): void {
    this._effectParamsCache.clear();
  }

  /**
   * Create effect context for IEffectRunner
   * Provides GPU resources from the compositor
   */
  private _createEffectContext(): IEffectContext {
    if (!this._compositor) {
      throw new Error('Compositor not initialized');
    }

    const compositor = this._compositor;
    const gpuDevice = compositor.gpuDevice;

    if (!gpuDevice) {
      throw new Error('WebGPU device not available');
    }

    return {
      device: gpuDevice,
      queue: gpuDevice.queue,
      width: this._width,
      height: this._height,
      createTexture: (source: TextureSource) => compositor.createTexture(source),
      createEmptyTexture: (width: number, height: number) => {
        // Create an empty texture via compositor
        // For now, create a small canvas as source
        const canvas = new OffscreenCanvas(width, height);
        return compositor.createTexture(canvas);
      },
      deleteTexture: (texture: ITexture) => compositor.deleteTexture(texture),
    };
  }


  /**
   * Check if an effect type is supported for GPU rendering
   */
  private _isEffectSupported(effectType: string): boolean {
    // Effects that have GPU shader support
    const supportedEffects = [
      'gaussian-blur',
      'motion-blur',
      'radial-blur',
      'sharpen',
      'chroma-key',
      'luma-key',
      'chromatic-aberration',
      'noise',
      'glow',
      'vignette',
      'curves',
      'hsl',
    ];
    return supportedEffects.includes(effectType);
  }

  /**
   * Get list of supported effect types
   * @public Exposed for UI to show which effects have GPU acceleration
   */
  getSupportedEffectTypes(): string[] {
    const legacyEffects = [
      'gaussian-blur',
      'motion-blur',
      'radial-blur',
      'sharpen',
      'chroma-key',
      'luma-key',
      'chromatic-aberration',
      'noise',
      'glow',
      'vignette',
      'curves',
      'hsl',
    ];

    // Merge with IEffectRunner supported effects
    if (this._effectRunner) {
      const runnerEffects = this._effectRunner.getSupportedEffects();
      const allEffects = new Set([...legacyEffects, ...runnerEffects]);
      return Array.from(allEffects);
    }

    return legacyEffects;
  }

  /**
   * Get the effect runner instance (for advanced usage)
   * @public
   */
  getEffectRunner(): IEffectRunner | null {
    return this._effectRunner;
  }

  /**
   * Parse color string to RGB array (0-1 normalized)
   */
  private _parseColor(color: string): [number, number, number] {
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b];
    }

    // Handle rgb/rgba colors
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      return [
        parseInt(rgbMatch[1]!, 10) / 255,
        parseInt(rgbMatch[2]!, 10) / 255,
        parseInt(rgbMatch[3]!, 10) / 255,
      ];
    }

    // Default to black
    return [0, 0, 0];
  }

  // -------------------------------------------------------------------------
  // Masks Processing (Phase 3)
  // -------------------------------------------------------------------------

  /**
   * Process masks for an element and prepare them for compositor
   * Returns computed mask instances with animated properties resolved
   *
   * Note: This prepares masks for the compositor's drawLayer method.
   * The actual mask rendering is handled by the compositor using mask shaders.
   */
  private _processMasks(element: GPURenderableElement): MaskInstance[] | undefined {
    const masks = element.masks;
    const localTime = element.localTime ?? 0;

    if (!masks || masks.length === 0) {
      return undefined;
    }

    // Process each mask: resolve animations and prepare for rendering
    const processedMasks: MaskInstance[] = [];

    for (const mask of masks) {
      // Get computed values at current time (handles animation)
      const computed = getComputedMaskAtTime(mask, localTime);

      // Create processed mask with computed values
      const processedMask: MaskInstance = {
        ...mask,
        shape: computed.shape,
        feather: computed.feather,
        expansion: computed.expansion,
        opacity: computed.opacity,
      };

      processedMasks.push(processedMask);

      // Log mask processing (for debugging)
      console.debug(
        `[GPURenderEngine] Processing mask "${mask.name}" for element ${element.id}:`,
        {
          type: mask.shape.type,
          inverted: mask.inverted,
          blendMode: mask.blendMode,
          feather: computed.feather,
          expansion: computed.expansion,
          opacity: computed.opacity,
        }
      );
    }

    return processedMasks.length > 0 ? processedMasks : undefined;
  }

  /**
   * Get supported mask shape types
   * @public Exposed for UI to show mask capabilities
   */
  getSupportedMaskTypes(): string[] {
    return ['rectangle', 'ellipse', 'polygon', 'bezier'];
  }

  /**
   * Check if masks are supported for GPU rendering
   */
  isMaskSupportedForGPU(): boolean {
    // Masks are supported when compositor is available and has mask shaders
    return this._compositor !== null;
  }

  // -------------------------------------------------------------------------
  // Transitions Processing (Phase 3)
  // -------------------------------------------------------------------------

  /**
   * Get active transitions for all tracks at current time
   * Returns a map of trackIndex -> active transitions in that track
   */
  private _getActiveTransitions(
    project: ProjectData,
    time: number,
    renderableElements: GPURenderableElement[]
  ): Map<number, ActiveTransition[]> {
    const activeTransitions = new Map<number, ActiveTransition[]>();

    if (!project.tracks) {
      return activeTransitions;
    }

    for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
      const track = project.tracks[trackIndex];
      if (!track?.transitions || track.transitions.length === 0) {
        continue;
      }

      const trackTransitions: ActiveTransition[] = [];

      for (const elementTransition of track.transitions) {
        const transition = elementTransition.transition;
        if (transition.type === 'none') {
          continue;
        }

        // Find the from and to elements
        const fromElement = track.elements.find((e) => e.id === elementTransition.fromElementId);
        const toElement = track.elements.find((e) => e.id === elementTransition.toElementId);

        if (!fromElement || !toElement) {
          continue;
        }

        // Calculate transition time range based on placement mode
        const transitionDuration = transition.duration;
        let transitionStart: number;
        let transitionEnd: number;

        if (elementTransition.placement === 'overlap') {
          // Overlap mode: transition happens in the overlapping area
          // The transition ends when toElement starts + transition duration
          transitionEnd = toElement.startTime + transitionDuration;
          transitionStart = toElement.startTime;
        } else {
          // Cut mode: transition happens at the cut point
          // fromElement end time = toElement start time
          transitionStart = fromElement.startTime + fromElement.duration - transitionDuration / 2;
          transitionEnd = transitionStart + transitionDuration;
        }

        // Check if current time is within transition range
        if (time >= transitionStart && time < transitionEnd) {
          // Calculate progress (0-1)
          const rawProgress = (time - transitionStart) / transitionDuration;
          const progress = this._applyEasing(rawProgress, transition.easing);

          // Find corresponding renderable elements
          const fromRenderable = renderableElements.find(
            (e) => e.id === elementTransition.fromElementId
          );
          const toRenderable = renderableElements.find(
            (e) => e.id === elementTransition.toElementId
          );

          trackTransitions.push({
            transition: elementTransition,
            fromElementId: elementTransition.fromElementId,
            toElementId: elementTransition.toElementId,
            progress,
            fromElement: fromRenderable,
            toElement: toRenderable,
          });
        }
      }

      if (trackTransitions.length > 0) {
        activeTransitions.set(trackIndex, trackTransitions);
      }
    }

    return activeTransitions;
  }

  /**
   * Render transition between two elements
   * Returns the result texture, or null if transition not applicable
   */
  private _renderTransition(
    fromTexture: ITexture,
    toTexture: ITexture,
    activeTransition: ActiveTransition
  ): ITexture | null {
    if (!this._compositor) {
      return null;
    }

    const transition = activeTransition.transition.transition;

    // Map TransitionType to GPUTransitionType
    const gpuType = this._mapTransitionTypeToGPU(transition.type);
    if (!gpuType || gpuType === 'none') {
      return null;
    }

    // Check if compositor supports this transition type
    if (!this._compositor.isTransitionSupported(gpuType)) {
      console.debug(
        `[GPURenderEngine] Transition type "${gpuType}" not supported by compositor, skipping`
      );
      return null;
    }

    // Build transition render parameters
    const params: TransitionRenderParams = {
      type: gpuType,
      progress: activeTransition.progress,
      softness: transition.params?.softness ?? transition.softness ?? 0.05,
      blindsCount: transition.params?.blindsCount ?? transition.blindsCount ?? 10,
      startAngle: transition.params?.startAngle ?? transition.startAngle ?? 0,
    };

    // Handle dip color
    if (gpuType === 'dip-to-color' || gpuType === 'dip-to-black' || gpuType === 'dip-to-white') {
      const colorStr = transition.params?.color ?? transition.dipColor;
      if (colorStr) {
        params.dipColor = this._parseColor(colorStr);
      } else if (gpuType === 'dip-to-black') {
        params.dipColor = [0, 0, 0];
      } else if (gpuType === 'dip-to-white') {
        params.dipColor = [1, 1, 1];
      }
    }

    console.debug(
      `[GPURenderEngine] Rendering transition "${gpuType}" at progress ${activeTransition.progress.toFixed(
        2
      )}`
    );

    // Render transition using compositor
    return this._compositor.renderTransition(fromTexture, toTexture, params, false);
  }

  /**
   * Map TransitionType to GPUTransitionType
   * Returns null if the transition type is not supported for GPU rendering
   */
  private _mapTransitionTypeToGPU(type: TransitionType): GPUTransitionType | null {
    // Check if type is directly supported
    if (type in GPU_TRANSITION_TYPE_MAP) {
      return type as GPUTransitionType;
    }

    // Some transition types are not yet implemented in GPU
    const unsupportedTypes: TransitionType[] = [
      'cube-left',
      'cube-right',
      'cube-up',
      'cube-down',
      'flip-horizontal',
      'flip-vertical',
      'page-curl-left',
      'page-curl-right',
      'pixelate',
      'blur',
      'glitch',
      'morph',
      'custom',
    ];

    if (unsupportedTypes.includes(type)) {
      return null;
    }

    return type as GPUTransitionType;
  }

  /**
   * Apply easing function to progress value
   * Supports all EasingType values defined in @uniedit/shared
   */
  private _applyEasing(t: number, easing: EasingType): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - Math.pow(1 - t, 2);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'ease-in-quad':
        return t * t;
      case 'ease-out-quad':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out-quad':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'ease-in-cubic':
        return t * t * t;
      case 'ease-out-cubic':
        return 1 - Math.pow(1 - t, 3);
      case 'ease-in-out-cubic':
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      case 'ease-in-back': {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return c3 * t * t * t - c1 * t * t;
      }
      case 'ease-out-back': {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      }
      case 'ease-in-out-back': {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
          ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
          : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
      }
      case 'bezier':
        // For custom bezier, fall back to ease-in-out as default
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default:
        // Exhaustive check - if new easing types are added, TypeScript will catch it
        return t;
    }
  }

  /**
   * Get supported transition types for GPU rendering
   * @public Exposed for UI to show GPU-accelerated transitions
   */
  getSupportedTransitionTypes(): GPUTransitionType[] {
    return this._compositor?.getSupportedTransitions() ?? [];
  }

  /**
   * Check if a transition type is supported for GPU rendering
   */
  isTransitionSupportedForGPU(type: TransitionType): boolean {
    const gpuType = this._mapTransitionTypeToGPU(type);
    if (!gpuType || !this._compositor) {
      return false;
    }
    return this._compositor.isTransitionSupported(gpuType);
  }

  /**
   * Interpolate animated property value
   */
  private _interpolateProperty(
    prop: { keyframes?: Array<{ time: number; value: number }> } | undefined,
    localTime: number
  ): number | undefined {
    if (!prop?.keyframes || prop.keyframes.length === 0) {
      return undefined;
    }

    const keyframes = prop.keyframes;

    // Before first keyframe
    if (localTime <= keyframes[0]!.time) {
      return keyframes[0]!.value;
    }

    // After last keyframe
    const lastIndex = keyframes.length - 1;
    if (localTime >= keyframes[lastIndex]!.time) {
      return keyframes[lastIndex]!.value;
    }

    // Find surrounding keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
      const kf1 = keyframes[i]!;
      const kf2 = keyframes[i + 1]!;

      if (localTime >= kf1.time && localTime < kf2.time) {
        // Linear interpolation
        const t = (localTime - kf1.time) / (kf2.time - kf1.time);
        return kf1.value + (kf2.value - kf1.value) * t;
      }
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Text/Shape Rendering
  // -------------------------------------------------------------------------

  /**
   * Render text element to ImageBitmap
   */
  private async _renderTextToCanvas(element: TextElement): Promise<ImageBitmap | null> {
    if (!this._textCanvas || !this._textContext) return null;

    const ctx = this._textContext;
    const width = this._textCanvas.width;
    const height = this._textCanvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set font
    const fontSize = element.fontSize ?? 48;
    const fontFamily = element.fontFamily ?? 'Arial';
    const fontWeight = element.fontWeight === 'bold' ? 'bold' : 'normal';
    const fontStyle = element.fontStyle === 'italic' ? 'italic' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

    // Set alignment
    ctx.textAlign = (element.textAlign as CanvasTextAlign) ?? 'center';
    ctx.textBaseline = 'middle';

    // Calculate position
    let x = width / 2;
    if (element.textAlign === 'left') {
      x = 0;
    } else if (element.textAlign === 'right') {
      x = width;
    }
    const y = height / 2;

    // Draw background if exists
    if (element.backgroundColor && element.backgroundColor !== 'transparent') {
      const metrics = ctx.measureText(element.content ?? '');
      const textWidth = metrics.width;
      const textHeight = fontSize * 1.2;
      const padding = 10;

      ctx.fillStyle = element.backgroundColor;
      ctx.fillRect(
        x - textWidth / 2 - padding,
        y - textHeight / 2 - padding,
        textWidth + padding * 2,
        textHeight + padding * 2
      );
    }

    // Draw text
    ctx.fillStyle = element.color ?? '#ffffff';
    ctx.fillText(element.content ?? '', x, y);

    // Draw text decoration
    if (element.textDecoration && element.textDecoration !== 'none') {
      const metrics = ctx.measureText(element.content ?? '');
      const textWidth = metrics.width;

      ctx.strokeStyle = element.color ?? '#ffffff';
      ctx.lineWidth = fontSize * 0.05;

      if (element.textDecoration === 'underline') {
        const underlineY = y + fontSize * 0.3;
        ctx.beginPath();
        ctx.moveTo(x - textWidth / 2, underlineY);
        ctx.lineTo(x + textWidth / 2, underlineY);
        ctx.stroke();
      } else if (element.textDecoration === 'line-through') {
        ctx.beginPath();
        ctx.moveTo(x - textWidth / 2, y);
        ctx.lineTo(x + textWidth / 2, y);
        ctx.stroke();
      }
    }

    // Convert to ImageBitmap
    return createImageBitmap(this._textCanvas);
  }

  /**
   * Render shape element to ImageBitmap
   */
  private async _renderShapeToCanvas(element: ShapeElement): Promise<ImageBitmap | null> {
    if (!this._textCanvas || !this._textContext) return null;

    const ctx = this._textContext;
    const canvas = this._textCanvas;
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Check for shape instances
    if (!element.shapes || element.shapes.length === 0) {
      return createImageBitmap(canvas);
    }

    // Sort by zIndex and render all shape instances
    const sortedShapes = [...element.shapes].sort((a, b) => a.zIndex - b.zIndex);

    for (const shapeInstance of sortedShapes) {
      if (!shapeInstance.visible) continue;
      this._renderShapeInstance(ctx, shapeInstance, width, height);
    }

    return createImageBitmap(canvas);
  }

  /**
   * Render a single shape instance
   */
  private _renderShapeInstance(
    ctx: OffscreenCanvasRenderingContext2D,
    instance: ShapeInstance,
    width: number,
    height: number
  ): void {
    ctx.save();

    // ShapeInstance doesn't have transform - individual shapes have their own position/rotation
    // Apply fill opacity from style
    ctx.globalAlpha = instance.style.fill.opacity;

    // Draw shape path
    ctx.beginPath();
    this._drawShapePath(ctx, instance.shape, width, height);

    // Apply fill
    const style = instance.style;
    if (style?.fill) {
      this._applyFill(ctx, style.fill, width, height);
      ctx.fill();
    }

    // Apply stroke
    if (style?.stroke && style.stroke.width > 0) {
      ctx.strokeStyle = style.stroke.color ?? '#000000';
      ctx.lineWidth = style.stroke.width;
      if (style.stroke.dashArray && style.stroke.dashArray.length > 0) {
        ctx.setLineDash(style.stroke.dashArray);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw shape path based on shape type
   */
  private _drawShapePath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: RectangleShape | EllipseShape | PolygonShape | StarShape | LineShape | BezierShape,
    width: number,
    height: number
  ): void {
    switch (shape.shapeType) {
      case 'rectangle': {
        const rect = shape as RectangleShape;
        const cx = (rect.centerX / 100) * width;
        const cy = (rect.centerY / 100) * height;
        const w = (rect.width / 100) * width;
        const h = (rect.height / 100) * height;
        const x = cx - w / 2;
        const y = cy - h / 2;
        const r = rect.cornerRadius ?? 0;

        if (r > 0) {
          const radius = (r / 100) * Math.min(w, h);
          ctx.roundRect(x, y, w, h, radius);
        } else {
          ctx.rect(x, y, w, h);
        }
        break;
      }

      case 'ellipse': {
        const ellipse = shape as EllipseShape;
        const cx = (ellipse.centerX / 100) * width;
        const cy = (ellipse.centerY / 100) * height;
        const rx = (ellipse.radiusX / 100) * width;
        const ry = (ellipse.radiusY / 100) * height;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        break;
      }

      case 'polygon': {
        const polygon = shape as PolygonShape;
        if (polygon.points.length < 2) break;

        const firstPoint = polygon.points[0]!;
        ctx.moveTo((firstPoint.x / 100) * width, (firstPoint.y / 100) * height);
        for (let i = 1; i < polygon.points.length; i++) {
          const point = polygon.points[i]!;
          ctx.lineTo((point.x / 100) * width, (point.y / 100) * height);
        }
        ctx.closePath();
        break;
      }

      case 'star': {
        const star = shape as StarShape;
        const points = generateStarPoints(star);

        if (points.length > 0) {
          ctx.moveTo((points[0]!.x / 100) * width, (points[0]!.y / 100) * height);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo((points[i]!.x / 100) * width, (points[i]!.y / 100) * height);
          }
          ctx.closePath();
        }
        break;
      }

      case 'line': {
        const line = shape as LineShape;
        ctx.moveTo((line.startX / 100) * width, (line.startY / 100) * height);
        ctx.lineTo((line.endX / 100) * width, (line.endY / 100) * height);
        break;
      }

      case 'bezier': {
        const bezier = shape as BezierShape;
        if (bezier.points.length < 2) break;

        const first = bezier.points[0]!;
        // BezierPoint uses 'anchor' for the main point, not 'point'
        ctx.moveTo((first.anchor.x / 100) * width, (first.anchor.y / 100) * height);

        for (let i = 1; i < bezier.points.length; i++) {
          const bp = bezier.points[i]!;
          const prevBp = bezier.points[i - 1]!;

          // handleOut/handleIn are relative to anchor, so we need to add them
          const prevHandleOut = {
            x: prevBp.anchor.x + prevBp.handleOut.x,
            y: prevBp.anchor.y + prevBp.handleOut.y,
          };
          const currHandleIn = {
            x: bp.anchor.x + bp.handleIn.x,
            y: bp.anchor.y + bp.handleIn.y,
          };

          ctx.bezierCurveTo(
            (prevHandleOut.x / 100) * width,
            (prevHandleOut.y / 100) * height,
            (currHandleIn.x / 100) * width,
            (currHandleIn.y / 100) * height,
            (bp.anchor.x / 100) * width,
            (bp.anchor.y / 100) * height
          );
        }

        if (bezier.closed) {
          ctx.closePath();
        }
        break;
      }
    }
  }

  /**
   * Apply fill style
   */
  private _applyFill(
    ctx: OffscreenCanvasRenderingContext2D,
    fill: { type: string; color?: string; gradient?: { type: string; stops: Array<{ offset: number; color: string }> } },
    width: number,
    height: number
  ): void {
    if (fill.type === 'solid') {
      ctx.fillStyle = fill.color ?? '#ffffff';
    } else if (fill.type === 'gradient' && fill.gradient) {
      const g = fill.gradient;
      let gradient: CanvasGradient;

      if (g.type === 'linear') {
        gradient = ctx.createLinearGradient(0, 0, width, height);
      } else {
        gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) / 2
        );
      }

      for (const stop of g.stops) {
        gradient.addColorStop(stop.offset, stop.color);
      }

      ctx.fillStyle = gradient;
    }
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  /**
   * Export to ImageData
   */
  toImageData(): ImageData {
    if (!this._compositor) {
      throw new Error('[GPURenderEngine] Not initialized');
    }
    return this._compositor.toImageData();
  }

  /**
   * Export to ImageData (async - required for WebGPU)
   */
  async toImageDataAsync(): Promise<ImageData> {
    if (!this._compositor) {
      throw new Error('[GPURenderEngine] Not initialized');
    }
    return this._compositor.toImageDataAsync();
  }

  /**
   * Export to Blob
   */
  async toBlob(type = 'image/png', quality = 0.92): Promise<Blob> {
    if (!this._compositor) {
      throw new Error('[GPURenderEngine] Not initialized');
    }
    return this._compositor.toBlob(type, quality);
  }

  /**
   * Export to ImageBitmap
   */
  async toImageBitmap(): Promise<ImageBitmap> {
    const imageData = this.toImageData();
    return createImageBitmap(imageData);
  }

  /**
   * Export to VideoFrame
   */
  toVideoFrame(timestamp: number): VideoFrame {
    if (!this._compositor) {
      console.error('[GPURenderEngine] toVideoFrame: compositor is null');
      throw new Error('[GPURenderEngine] Not initialized');
    }
    console.log('[GPURenderEngine] toVideoFrame: calling compositor.toVideoFrame', {
      timestamp,
      backend: this._compositor.backend,
    });
    return this._compositor.toVideoFrame(timestamp);
  }

  // -------------------------------------------------------------------------
  // Frame Export Generator
  // -------------------------------------------------------------------------

  /**
   * Export all frames as async generator
   */
  async *exportFrames(
    project: ProjectData,
    fps: number,
    onProgress?: GPUProgressCallback
  ): AsyncGenerator<GPUFrameResult> {
    if (!this._isInitialized) {
      throw new Error('[GPURenderEngine] Not initialized');
    }

    const duration = this._calculateDuration(project);
    const totalFrames = Math.ceil(duration * fps);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const time = frameIndex / fps;
      const startTime = performance.now();

      // Render frame
      await this.renderProjectFrame(project, time, 'export', 'final');

      // Export to ImageBitmap
      const imageBitmap = await this.toImageBitmap();
      const renderTime = performance.now() - startTime;

      // Call progress callback
      if (onProgress) {
        onProgress(frameIndex, totalFrames, (frameIndex + 1) / totalFrames);
      }

      yield {
        frameIndex,
        totalFrames,
        renderTime,
        imageBitmap,
      };
    }
  }

  /**
   * Calculate project duration
   */
  private _calculateDuration(project: ProjectData): number {
    let maxDuration = 0;

    for (const track of project.tracks) {
      for (const element of track.elements) {
        const elementEnd = element.startTime + element.duration;
        if (elementEnd > maxDuration) {
          maxDuration = elementEnd;
        }
      }
    }

    return maxDuration;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create GPU render engine instance
 */
export function createGPURenderEngine(): GPURenderEngine {
  return new GPURenderEngine();
}

// =============================================================================
// Export Adapter
// =============================================================================

import {
  ExportPixelReader,
  createExportPixelReader,
  type PixelReadResult,
} from './webgl/ExportPixelReader';

import {
  ExportPixelReaderGPU,
  createExportPixelReaderGPU,
} from './webgpu/ExportPixelReaderGPU';

/**
 * IExportRenderEngine interface for StreamingExportManager compatibility
 */
export interface IExportRenderEngine {
  /** Render frame at specific time */
  renderFrame(project: ProjectData, time: number): Promise<void>;
  /** Read rendered pixels as RGBA Uint8Array */
  readPixels(): Promise<Uint8Array>;
  /** Read rendered frame as JPEG (much smaller than raw pixels) */
  readAsJpeg?(quality?: number): Promise<Uint8Array>;
  /** Get canvas size */
  getSize(): { width: number; height: number };
  /** Preload frames for export optimization (optional) */
  preloadFrames?(project: ProjectData, startTime: number, duration: number): Promise<void>;
  /** Trigger smart preload (optional) */
  triggerSmartPreload?(project: ProjectData, currentTime: number): void;

  // =========================================================================
  // Double-buffered async read API (optional, for performance optimization)
  // =========================================================================

  /** Initialize async reader for export */
  initAsyncReader?(format: 'jpeg' | 'rgba', jpegQuality?: number): void;
  /** Start async read of current frame (non-blocking) */
  startAsyncRead?(frameIndex: number): void;
  /** Get async read result (may wait if not ready) */
  getAsyncResult?(frameIndex: number): Promise<PixelReadResult | null>;
  /** Dispose async reader */
  disposeAsyncReader?(): void;
  /** Check if async reader is available */
  hasAsyncReader?(): boolean;
}

/**
 * Adapter to make GPURenderEngine compatible with StreamingExportManager
 *
 * Phase 6: Bridges GPURenderEngine to IExportRenderEngine interface
 * Phase 7: Added double-buffered async pixel reading for performance
 * Phase 8: Support both WebGL (PBO) and WebGPU (mapAsync) async reading
 * Phase 9: Optimized export with preload buffer strategy
 */
export class GPURenderEngineExportAdapter implements IExportRenderEngine {
  private _engine: GPURenderEngine;
  private _asyncReaderWebGL: ExportPixelReader | null = null;
  private _asyncReaderWebGPU: ExportPixelReaderGPU | null = null;

  // Export optimization: use preload buffer instead of blocking requests
  private _usePreloadBuffer = false;
  private _preloadWindowSeconds = 5; // Preload 5 seconds ahead
  private _lastPreloadTime = -1;

  constructor(engine: GPURenderEngine) {
    this._engine = engine;
  }

  /**
   * Enable optimized export mode that uses preload buffer
   * This significantly improves export performance by avoiding blocking frame requests
   * @param windowSeconds Preload window size in seconds (default: 5)
   */
  enablePreloadBufferMode(windowSeconds = 5): void {
    this._usePreloadBuffer = true;
    this._preloadWindowSeconds = windowSeconds;
    this._lastPreloadTime = -1;
  }

  /**
   * Disable preload buffer mode
   */
  disablePreloadBufferMode(): void {
    this._usePreloadBuffer = false;
    this._lastPreloadTime = -1;
  }

  /**
   * Ensure frames are preloaded for the given time range
   * Call this before rendering to ensure frames are available in the buffer
   * @param project Project data
   * @param currentTime Current time in seconds
   * @param fps Frames per second
   */
  async ensureFramesPreloaded(project: ProjectData, currentTime: number, fps: number): Promise<void> {
    if (!this._usePreloadBuffer || !this._engine.frameProvider) return;

    // Only trigger preload if we've moved past the last preload point
    // or if this is the first preload
    const preloadThreshold = this._preloadWindowSeconds * 0.3; // Trigger when 30% of buffer consumed
    if (this._lastPreloadTime >= 0 && currentTime < this._lastPreloadTime + preloadThreshold) {
      return;
    }

    this._lastPreloadTime = currentTime;

    // Preload all video sources in the project
    const preloadPromises: Promise<void>[] = [];

    for (const track of project.tracks) {
      if (!track?.elements) continue;

      for (const element of track.elements) {
        if (!element || element.type !== 'media') continue;

        const mediaElement = element as MediaElement;
        const ext = mediaElement.src.split('.').pop()?.toLowerCase() ?? '';
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'];

        if (!videoExtensions.includes(ext)) continue;

        // Check if element overlaps with preload range
        const elementEnd = element.startTime + element.duration;
        const preloadEnd = currentTime + this._preloadWindowSeconds;

        if (preloadEnd < element.startTime || currentTime > elementEnd) continue;

        // Calculate source time range
        const overlapStart = Math.max(currentTime, element.startTime);
        const sourceStart = (overlapStart - element.startTime) + element.trimStart;

        // Use clearAndPreloadFirstWindow for aggressive preloading
        preloadPromises.push(
          this._engine.clearAndPreloadFirstWindow(mediaElement.src, sourceStart, fps)
        );
      }
    }

    if (preloadPromises.length > 0) {
      await Promise.all(preloadPromises);
    }
  }

  /**
   * Render a frame at specific time
   * If preload buffer mode is enabled, uses non-blocking frame fetching
   */
  async renderFrame(project: ProjectData, time: number): Promise<void> {
    await this._engine.renderProjectFrame(project, time, 'export', 'final', this._usePreloadBuffer);
  }

  /**
   * Read rendered pixels as RGBA Uint8Array
   */
  async readPixels(): Promise<Uint8Array> {
    // Use async version for WebGPU compatibility
    const imageData = await this._engine.toImageDataAsync();
    return new Uint8Array(imageData.data.buffer);
  }

  /**
   * Read rendered frame as JPEG (much smaller than raw pixels)
   * @param quality JPEG quality (0-1, default 0.92)
   */
  async readAsJpeg(quality = 0.92): Promise<Uint8Array> {
    const blob = await this._engine.toBlob('image/jpeg', quality);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Get canvas size
   */
  getSize(): { width: number; height: number } {
    return {
      width: this._engine.width,
      height: this._engine.height,
    };
  }

  // ===========================================================================
  // Double-buffered Async Read API
  // ===========================================================================

  /**
   * Initialize async reader for export
   * Automatically selects WebGL (PBO) or WebGPU (mapAsync) based on backend
   */
  initAsyncReader(format: 'jpeg' | 'rgba' = 'jpeg', jpegQuality = 0.75): void {
    // Dispose existing readers
    if (this._asyncReaderWebGL) {
      this._asyncReaderWebGL.dispose();
      this._asyncReaderWebGL = null;
    }
    if (this._asyncReaderWebGPU) {
      this._asyncReaderWebGPU.dispose();
      this._asyncReaderWebGPU = null;
    }

    const compositor = this._engine.compositor;
    if (!compositor) {
      return;
    }

    const canvas = compositor.canvas;
    if (!canvas) {
      return;
    }

    const backend = compositor.backend;

    if (backend === 'webgpu') {
      // Use WebGPU async reader
      const device = compositor.gpuDevice;
      if (!device) {
        return;
      }

      this._asyncReaderWebGPU = createExportPixelReaderGPU({
        width: this._engine.width,
        height: this._engine.height,
        format,
        jpegQuality,
      });

      this._asyncReaderWebGPU.initialize(device, canvas);
    } else {
      // Use WebGL async reader (PBO)
      const gl = compositor.nativeContext;
      if (!gl) {
        return;
      }

      this._asyncReaderWebGL = createExportPixelReader({
        width: this._engine.width,
        height: this._engine.height,
        format,
        jpegQuality,
        usePBO: true,
      });

      this._asyncReaderWebGL.initialize(gl, canvas);
    }
  }

  /**
   * Start async read of current frame (non-blocking)
   */
  startAsyncRead(frameIndex: number): void {
    if (this._asyncReaderWebGPU) {
      this._asyncReaderWebGPU.startAsyncRead(frameIndex);
    } else if (this._asyncReaderWebGL) {
      this._asyncReaderWebGL.startAsyncRead(frameIndex);
    }
  }

  /**
   * Get async read result
   */
  async getAsyncResult(frameIndex: number): Promise<PixelReadResult | null> {
    if (this._asyncReaderWebGPU) {
      return this._asyncReaderWebGPU.getResult(frameIndex);
    } else if (this._asyncReaderWebGL) {
      return this._asyncReaderWebGL.getResult(frameIndex);
    }
    return null;
  }

  /**
   * Dispose async reader
   */
  disposeAsyncReader(): void {
    if (this._asyncReaderWebGPU) {
      this._asyncReaderWebGPU.dispose();
      this._asyncReaderWebGPU = null;
    }
    if (this._asyncReaderWebGL) {
      this._asyncReaderWebGL.dispose();
      this._asyncReaderWebGL = null;
    }
  }

  /**
   * Check if async reader is available
   */
  hasAsyncReader(): boolean {
    return this._asyncReaderWebGPU !== null || this._asyncReaderWebGL !== null;
  }

  /**
   * Preload frames for a time range (for export optimization)
   * @param project Project data
   * @param startTime Start time in seconds
   * @param duration Duration in seconds
   */
  async preloadFrames(project: ProjectData, startTime: number, duration: number): Promise<void> {
    if (!this._engine.frameProvider) return;

    const fps = project.fps || 30;

    // Extract video sources from project
    for (const track of project.tracks) {
      if (!track?.elements) continue;

      for (const element of track.elements) {
        if (!element || element.type !== 'media') continue;

        const mediaElement = element as MediaElement;
        const ext = mediaElement.src.split('.').pop()?.toLowerCase() ?? '';
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'];

        if (!videoExtensions.includes(ext)) continue;

        // Check if element overlaps with preload range
        const elementEnd = element.startTime + element.duration;
        const preloadEnd = startTime + duration;

        if (preloadEnd < element.startTime || startTime > elementEnd) continue;

        // Calculate source time range
        const overlapStart = Math.max(startTime, element.startTime);
        const sourceStart = (overlapStart - element.startTime) + element.trimStart;

        // Use GPURenderEngine's preload method
        await this._engine.clearAndPreloadFirstWindow(
          mediaElement.src,
          sourceStart,
          fps
        );
      }
    }
  }

  /**
   * Trigger smart preload for continuous playback
   * @param project Project data
   * @param currentTime Current playhead time
   */
  triggerSmartPreload(project: ProjectData, currentTime: number): void {
    if (!this._engine.frameProvider) return;

    const fps = project.fps || 30;

    // Extract video sources and trigger preload
    for (const track of project.tracks) {
      if (!track?.elements) continue;

      for (const element of track.elements) {
        if (!element || element.type !== 'media') continue;

        const mediaElement = element as MediaElement;
        const ext = mediaElement.src.split('.').pop()?.toLowerCase() ?? '';
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'];

        if (!videoExtensions.includes(ext)) continue;

        // Check if element is active at current time
        const elementEnd = element.startTime + element.duration;
        if (currentTime < element.startTime || currentTime > elementEnd) continue;

        // Calculate source time
        const sourceTime = (currentTime - element.startTime) + element.trimStart;

        // Trigger smart preload (non-blocking)
        this._engine.smartPreload(mediaElement.src, sourceTime, fps).catch(() => {
          // Ignore preload errors
        });
      }
    }
  }

  /**
   * Get underlying GPURenderEngine
   */
  get engine(): GPURenderEngine {
    return this._engine;
  }
}

/**
 * Create export adapter for GPURenderEngine
 */
export function createExportAdapter(engine: GPURenderEngine): GPURenderEngineExportAdapter {
  return new GPURenderEngineExportAdapter(engine);
}
