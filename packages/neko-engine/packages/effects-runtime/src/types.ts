/**
 * Effects Runtime Types
 *
 * Core type definitions for the GPU effect runtime.
 * Designed for zero-copy texture passing and cross-backend compatibility.
 */

// =============================================================================
// Effect Types (compatible with @neko/effects-core)
// =============================================================================

/**
 * Effect category
 */
export type EffectCategory =
  | 'color'
  | 'blur'
  | 'distort'
  | 'stylize'
  | 'generate'
  | 'keying'
  | 'time'
  | 'audio'
  | 'custom';

/**
 * Effect type identifier
 */
export type EffectType =
  // Color
  | 'colorCorrection'
  | 'curves'
  | 'levels'
  | 'hslAdjust'
  | 'colorBalance'
  | 'vibrance'
  | 'exposure'
  | 'whiteBalance'
  | 'lut'
  | 'tint'
  | 'blackAndWhite'
  | 'sepia'
  | 'invert'
  | 'posterize'
  | 'threshold'
  // Blur
  | 'gaussianBlur'
  | 'boxBlur'
  | 'motionBlur'
  | 'radialBlur'
  | 'zoomBlur'
  | 'lensBlur'
  | 'tiltShift'
  | 'sharpen'
  | 'unsharpMask'
  // Distort
  | 'transform'
  | 'cornerPin'
  | 'bezierWarp'
  | 'spherize'
  | 'twirl'
  | 'ripple'
  | 'wave'
  | 'displacementMap'
  | 'lensDistortion'
  // Stylize
  | 'glow'
  | 'bloom'
  | 'vignette'
  | 'filmGrain'
  | 'chromaticAberration'
  | 'halftone'
  | 'mosaic'
  | 'pixelate'
  | 'oilPaint'
  | 'sketch'
  | 'emboss'
  | 'edgeDetect'
  // Generate
  | 'solidColor'
  | 'gradient'
  | 'noise'
  | 'fractalNoise'
  | 'checkerboard'
  | 'grid'
  // Keying
  | 'chromaKey'
  | 'lumaKey'
  | 'colorKey'
  | 'differenceKey'
  // Time
  | 'echo'
  | 'trails'
  | 'posterizeTime'
  // Custom
  | 'custom';

/**
 * Base effect parameters
 */
export interface EffectParams {
  /** Effect enabled state */
  enabled?: boolean;
  /** Effect opacity/mix (0-1) */
  mix?: number;
}

/**
 * Effect instance on a clip
 * Compatible with @neko/effects-core EffectInstance
 */
export interface EffectInstance {
  /** Instance ID */
  id: string;
  /** Effect definition ID */
  effectId: string;
  /** Target clip ID */
  clipId: string;
  /** Effect type */
  type: EffectType;
  /** Order in effect stack (lower = applied first) */
  order: number;
  /** Whether the effect is enabled */
  enabled: boolean;
  /** Effect parameters */
  params: Record<string, unknown>;
  /** Keyframe animations for effect params */
  animations?: Record<string, unknown>;
}

// =============================================================================
// Texture Types (compatible with ICompositor.ITexture)
// =============================================================================

/**
 * Abstract texture interface
 * Compatible with ICompositor.ITexture from rendering module
 */
export interface ITexture {
  /** Texture width */
  readonly width: number;
  /** Texture height */
  readonly height: number;
  /** Native texture object (GPUTexture | WebGLTexture) */
  readonly native: unknown;
  /** Texture ID (for cache management) */
  readonly id: string;
}

/**
 * Texture source types
 */
export type TextureSource =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | ImageData
  | VideoFrame
  | RawTextureSource;

/**
 * Raw pixel data texture source
 */
export interface RawTextureSource {
  /** Pixel data (RGBA format) */
  data: ArrayBuffer | Uint8Array;
  /** Width */
  width: number;
  /** Height */
  height: number;
  /** Pixel format (default 'rgba8') */
  format?: 'rgba8' | 'bgra8';
}

// =============================================================================
// Effect Runner Types
// =============================================================================

/**
 * Effect runner state
 */
export type EffectRunnerState =
  | 'uninitialized'
  | 'ready'
  | 'processing'
  | 'error'
  | 'disposed';

/**
 * GPU backend type
 */
export type EffectRunnerBackend = 'webgpu' | 'webgl' | 'wgpu';

/**
 * Effect runner GPU info
 */
export interface EffectRunnerGpuInfo {
  /** GPU device name */
  deviceName: string;
  /** GPU vendor */
  vendor: string;
  /** GPU backend */
  backend: EffectRunnerBackend;
  /** Whether the GPU is discrete */
  isDiscrete: boolean;
  /** Maximum texture size */
  maxTextureSize: number;
}

// =============================================================================
// Effect Context
// =============================================================================

/**
 * Effect execution context
 * Provides GPU resources for effect processing
 */
export interface IEffectContext {
  /** GPU device (WebGPU: GPUDevice, WebGL: WebGL2RenderingContext) */
  readonly device: GPUDevice | WebGL2RenderingContext;
  /** GPU queue (WebGPU only) */
  readonly queue?: GPUQueue;
  /** Canvas width */
  readonly width: number;
  /** Canvas height */
  readonly height: number;
  /** Create a texture from source */
  createTexture(source: TextureSource): ITexture | null;
  /** Create an empty texture with specified dimensions */
  createEmptyTexture(width: number, height: number): ITexture | null;
  /** Delete a texture */
  deleteTexture(texture: ITexture): void;
}

// =============================================================================
// Effect Run Result
// =============================================================================

/**
 * Effect run result
 */
export interface EffectRunResult {
  /** Output texture (caller owns, must delete if isNewTexture is true) */
  texture: ITexture;
  /** Whether the texture is newly created (vs reused input) */
  isNewTexture: boolean;
  /** Processing time in milliseconds */
  processingTime: number;
}

// =============================================================================
// IEffectRunner Interface
// =============================================================================

/**
 * IEffectRunner - Unified effect execution interface
 *
 * Design goals:
 * 1. Zero-copy texture passing (no CPU-GPU transfer)
 * 2. Reusable across WebGPU/WebGL/wgpu backends
 * 3. Composable with GPURenderEngine
 *
 * Usage:
 * ```typescript
 * const runner = createWebGPUEffectRunner();
 * await runner.initialize(context);
 *
 * // Process effects on GPU texture
 * const result = await runner.run(inputTexture, effects, localTime);
 *
 * // Use result.texture for rendering
 * compositor.drawLayer({ texture: result.texture, ... });
 *
 * // Cleanup if needed
 * if (result.isNewTexture) {
 *   context.deleteTexture(result.texture);
 * }
 * ```
 */
export interface IEffectRunner {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Current state */
  readonly state: EffectRunnerState;

  /** GPU information */
  readonly gpuInfo: EffectRunnerGpuInfo | null;

  /** Whether the runner is ready */
  readonly isReady: boolean;

  /** Backend type */
  readonly backend: EffectRunnerBackend;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the effect runner
   * @param context Effect execution context (provides GPU resources)
   */
  initialize(context: IEffectContext): Promise<void>;

  /**
   * Dispose resources
   */
  dispose(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Effect Execution
  // ---------------------------------------------------------------------------

  /**
   * Run effects on a texture (zero-copy)
   *
   * @param input Input texture (not modified)
   * @param effects Effects to apply (in order)
   * @param localTime Local time for animation (seconds)
   * @returns Effect run result with output texture
   */
  run(
    input: ITexture,
    effects: EffectInstance[],
    localTime: number
  ): Promise<EffectRunResult>;

  /**
   * Run a single effect on a texture
   *
   * @param input Input texture
   * @param effect Effect to apply
   * @param localTime Local time for animation
   * @returns Effect run result
   */
  runSingle(
    input: ITexture,
    effect: EffectInstance,
    localTime: number
  ): Promise<EffectRunResult>;

  // ---------------------------------------------------------------------------
  // Effect Support
  // ---------------------------------------------------------------------------

  /**
   * Check if an effect type is supported
   */
  isEffectSupported(effectType: string): boolean;

  /**
   * Get list of supported effect types
   */
  getSupportedEffects(): string[];

  // ---------------------------------------------------------------------------
  // Custom Shaders (optional)
  // ---------------------------------------------------------------------------

  /**
   * Register a custom shader
   * @param id Shader identifier
   * @param shaderCode Shader source code (WGSL for WebGPU, GLSL for WebGL)
   */
  registerCustomShader?(id: string, shaderCode: string): Promise<void>;
}

// =============================================================================
// Cross-Process Extension (P2: wgpu support)
// =============================================================================

/**
 * Cross-process texture handle
 * For sharing textures between Webview and Extension Host
 */
export interface TextureHandle {
  /** Unique handle ID */
  id: string;
  /** Texture dimensions */
  width: number;
  height: number;
  /** Pixel format */
  format: 'rgba8' | 'bgra8';
  /** Platform-specific handle data */
  platformHandle?: {
    /** macOS: IOSurface handle */
    ioSurface?: number;
    /** Windows: D3D11 shared handle */
    d3d11Handle?: number;
    /** Linux: DMA-BUF fd */
    dmaBufFd?: number;
  };
}

/**
 * IEffectRunner extension for cross-process texture sharing
 * Reserved for P2: wgpu support in Extension Host
 */
export interface ICrossProcessEffectRunner extends IEffectRunner {
  /**
   * Import a texture from a cross-process handle
   */
  importTexture(handle: TextureHandle): Promise<ITexture>;

  /**
   * Export a texture to a cross-process handle
   */
  exportTexture(texture: ITexture): Promise<TextureHandle>;
}

// =============================================================================
// Factory Types
// =============================================================================

/**
 * Effect runner factory options
 */
export interface EffectRunnerOptions {
  /** Preferred backend (default: 'webgpu') */
  preferredBackend?: EffectRunnerBackend;
  /** Allow fallback to other backends */
  allowFallback?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Effect runner factory function type
 */
export type EffectRunnerFactory = (
  options?: EffectRunnerOptions
) => IEffectRunner;
