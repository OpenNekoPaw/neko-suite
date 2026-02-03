/**
 * Wgpu Effect Runner
 *
 * Implements ICrossProcessEffectRunner using wgpu via media-processor-rs.
 * Designed for GPU effect processing in Extension Host (Node.js environment).
 *
 * This runner wraps the Rust-based MediaProcessor to provide:
 * - GPU-accelerated effect processing
 * - Cross-process texture sharing (via TextureHandle)
 * - Zero-copy texture operations where possible
 */

import type {
  ICrossProcessEffectRunner,
  IEffectContext,
  ITexture,
  EffectInstance,
  EffectRunResult,
  EffectRunnerState,
  EffectRunnerBackend,
  EffectRunnerGpuInfo,
  TextureHandle,
} from '../types';

// =============================================================================
// Types for media-processor-rs
// =============================================================================

/**
 * Frame data type used by media-processor-rs
 */
interface FrameData {
  width: number;
  height: number;
  format: string;
  data: Uint8Array;
  timestamp: number;
  isKeyframe: boolean;
}

/**
 * Effect parameters for media-processor-rs
 */
interface EffectParams {
  // Basic adjustments
  brightness?: number;
  contrast?: number;
  saturation?: number;
  exposure?: number;

  // Tone adjustments
  gamma?: number;
  hueShift?: number;
  vibrance?: number;

  // White balance
  temperature?: number;
  tint?: number;

  // Highlights/Shadows
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
}

/**
 * Blur parameters for media-processor-rs
 */
interface BlurParams {
  blurType?: string; // "box" | "gaussian" | "directional" | "radial" | "zoom"
  radius?: number;
  directionX?: number;
  directionY?: number;
  centerX?: number;
  centerY?: number;
  strength?: number;
  samples?: number;
}

/**
 * Sharpen parameters for media-processor-rs
 */
interface SharpenParams {
  amount?: number;
  radius?: number;
  threshold?: number;
}

/**
 * Vignette parameters for media-processor-rs
 */
interface VignetteParams {
  amount?: number;
  radius?: number;
  softness?: number;
  roundness?: number;
}

/**
 * Film grain parameters for media-processor-rs
 */
interface FilmGrainParams {
  amount?: number;
  size?: number;
  time?: number;
  colorAmount?: number;
}

/**
 * Glow parameters for media-processor-rs
 */
interface GlowParams {
  intensity?: number;
  threshold?: number;
  radius?: number;
}

/**
 * Chromatic aberration parameters for media-processor-rs
 */
interface ChromaticAberrationParams {
  amount?: number;
  angle?: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Transition parameters for media-processor-rs
 */
interface TransitionParams {
  transitionType?: string;
  progress?: number;
  feather?: number;
  centerX?: number;
  centerY?: number;
  angle?: number;
}

/**
 * Supported transition types
 */
type TransitionType =
  | 'fade'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown'
  | 'irisCircle'
  | 'irisRectangle'
  | 'clock'
  | 'slideLeft'
  | 'slideRight'
  | 'zoomIn'
  | 'zoomOut'
  | 'dissolve'
  | 'pixelate'
  | 'ripple'
  | 'swirl'
  | 'glitch'
  | 'flash';

/**
 * Texture handle from media-processor-rs
 */
interface NativeTextureHandle {
  id: number;
  width: number;
  height: number;
  format: string;
  sharedMemoryKey?: string;
  generation: number;
}

/**
 * MediaProcessor type from @neko-engine/native-napi
 * Dynamically imported to handle cases where native module is not available
 */
interface MediaProcessorType {
  getGpuInfo(): { name: string; vendor: string; backend: string; deviceType: string };
  applyEffects(frame: FrameData, params: EffectParams): FrameData;
  applyBlur(frame: FrameData, params: BlurParams): FrameData;
  applySharpen(frame: FrameData, params: SharpenParams): FrameData;
  applyVignette(frame: FrameData, params: VignetteParams): FrameData;
  applyFilmGrain(frame: FrameData, params: FilmGrainParams): FrameData;
  applyGlow(frame: FrameData, params: GlowParams): FrameData;
  applyChromaticAberration(frame: FrameData, params: ChromaticAberrationParams): FrameData;
  applyTransition(fromFrame: FrameData, toFrame: FrameData, params: TransitionParams): FrameData;
  uploadToTexture(frame: FrameData, format?: string): NativeTextureHandle;
  readTexture(handle: NativeTextureHandle): FrameData;
  clearTexturePool(): void;
  texturePoolSize(): number;
  dispose(): void;
}

interface MediaProcessorModule {
  MediaProcessor: {
    create(): Promise<MediaProcessorType>;
  };
}

// =============================================================================
// Supported Effects
// =============================================================================

/**
 * Effects supported by wgpu backend via media-processor-rs
 */
const SUPPORTED_EFFECTS = [
  // Color correction
  'colorCorrection',
  // Blur effects
  'gaussianBlur',
  'boxBlur',
  'motionBlur',
  'radialBlur',
  'zoomBlur',
  // Sharpen
  'sharpen',
  // Style effects
  'vignette',
  'filmGrain',
  'glow',
  'chromaticAberration',
] as const;

/**
 * Transition types supported by wgpu backend
 */
const SUPPORTED_TRANSITIONS = [
  'fade',
  'wipeLeft',
  'wipeRight',
  'wipeUp',
  'wipeDown',
  'irisCircle',
  'irisRectangle',
  'clock',
  'slideLeft',
  'slideRight',
  'zoomIn',
  'zoomOut',
  'dissolve',
  'pixelate',
  'ripple',
  'swirl',
  'glitch',
  'flash',
] as const;

type SupportedEffectType = (typeof SUPPORTED_EFFECTS)[number];
type SupportedTransitionType = (typeof SUPPORTED_TRANSITIONS)[number];

// =============================================================================
// WgpuEffectRunner Implementation
// =============================================================================

/**
 * WgpuEffectRunner - GPU effect runner for Extension Host
 *
 * Uses wgpu via media-processor-rs for GPU-accelerated effect processing.
 * Implements ICrossProcessEffectRunner for cross-process texture sharing.
 *
 * @example
 * ```typescript
 * const runner = new WgpuEffectRunner();
 * await runner.initialize();
 *
 * // Process effects on frame data
 * const result = await runner.run(inputTexture, effects, localTime);
 *
 * // Export texture for cross-process sharing
 * const handle = await runner.exportTexture(result.texture);
 * ```
 */
export class WgpuEffectRunner implements ICrossProcessEffectRunner {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private _state: EffectRunnerState = 'uninitialized';
  private _gpuInfo: EffectRunnerGpuInfo | null = null;
  private _processor: MediaProcessorType | null = null;

  // Texture management
  private _textureIdCounter = 0;
  private _textureMap = new Map<string, WgpuTexture>();

  // ---------------------------------------------------------------------------
  // IEffectRunner Properties
  // ---------------------------------------------------------------------------

  get state(): EffectRunnerState {
    return this._state;
  }

  get gpuInfo(): EffectRunnerGpuInfo | null {
    return this._gpuInfo;
  }

  get isReady(): boolean {
    return this._state === 'ready' && this._processor !== null;
  }

  get backend(): EffectRunnerBackend {
    return 'wgpu';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the wgpu effect runner
   *
   * Note: For wgpu backend, the context parameter is optional since
   * we create our own GPU context via media-processor-rs.
   */
  async initialize(_context?: IEffectContext): Promise<void> {
    if (this._state !== 'uninitialized') {
      throw new Error(`Cannot initialize in state: ${this._state}`);
    }

    this._state = 'ready'; // Optimistically set to ready

    try {
      // Dynamically import media-processor-rs
      const module = (await import('@neko-engine/native-napi')) as MediaProcessorModule;
      this._processor = await module.MediaProcessor.create();

      // Get GPU info
      const gpuInfo = this._processor.getGpuInfo();
      this._gpuInfo = {
        deviceName: gpuInfo.name,
        vendor: gpuInfo.vendor,
        backend: 'wgpu',
        isDiscrete: gpuInfo.deviceType === 'DiscreteGpu',
        maxTextureSize: 16384, // wgpu default max texture size
      };

      console.log('[WgpuEffectRunner] Initialized successfully');
      console.log(`[WgpuEffectRunner] GPU: ${gpuInfo.name} (${gpuInfo.vendor}, ${gpuInfo.backend})`);
    } catch (error) {
      this._state = 'error';
      console.error('[WgpuEffectRunner] Failed to initialize:', error);
      throw new Error(`Failed to initialize wgpu effect runner: ${error}`);
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this._state === 'disposed') {
      return;
    }

    // Clear texture map
    this._textureMap.clear();

    // Dispose native processor
    if (this._processor) {
      try {
        this._processor.clearTexturePool();
        this._processor.dispose();
      } catch (error) {
        console.warn('[WgpuEffectRunner] Error disposing processor:', error);
      }
      this._processor = null;
    }

    this._gpuInfo = null;
    this._state = 'disposed';

    console.log('[WgpuEffectRunner] Disposed');
  }

  // ---------------------------------------------------------------------------
  // Effect Execution
  // ---------------------------------------------------------------------------

  /**
   * Run effects on a texture
   */
  async run(input: ITexture, effects: EffectInstance[], localTime: number): Promise<EffectRunResult> {
    if (!this.isReady || !this._processor) {
      throw new Error('Effect runner not ready');
    }

    const startTime = performance.now();

    // Filter enabled and supported effects
    const enabledEffects = effects
      .filter((e) => e.enabled && this.isEffectSupported(e.type))
      .sort((a, b) => a.order - b.order);

    // No effects to apply
    if (enabledEffects.length === 0) {
      return {
        texture: input,
        isNewTexture: false,
        processingTime: performance.now() - startTime,
      };
    }

    this._state = 'processing';

    try {
      // Get frame data from input texture
      const inputFrame = this._textureToFrame(input);

      // Apply effects sequentially
      let currentFrame = inputFrame;
      for (const effect of enabledEffects) {
        currentFrame = this._applyEffect(currentFrame, effect, localTime);
      }

      // Create output texture
      const outputTexture = this._frameToTexture(currentFrame);

      this._state = 'ready';

      return {
        texture: outputTexture,
        isNewTexture: true,
        processingTime: performance.now() - startTime,
      };
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  /**
   * Run a single effect on a texture
   */
  async runSingle(input: ITexture, effect: EffectInstance, localTime: number): Promise<EffectRunResult> {
    return this.run(input, [effect], localTime);
  }

  /**
   * Run a transition between two textures
   *
   * @param fromTexture - Source texture (outgoing frame)
   * @param toTexture - Target texture (incoming frame)
   * @param transitionType - Type of transition (e.g., 'fade', 'wipeLeft')
   * @param progress - Transition progress (0.0 to 1.0)
   * @param options - Additional transition options
   * @returns Resulting texture with transition applied
   */
  async runTransition(
    fromTexture: ITexture,
    toTexture: ITexture,
    transitionType: TransitionType,
    progress: number,
    options?: {
      feather?: number;
      centerX?: number;
      centerY?: number;
      angle?: number;
    }
  ): Promise<EffectRunResult> {
    if (!this.isReady || !this._processor) {
      throw new Error('Effect runner not ready');
    }

    if (!this.isTransitionSupported(transitionType)) {
      throw new Error(`Unsupported transition type: ${transitionType}`);
    }

    const startTime = performance.now();

    this._state = 'processing';

    try {
      // Convert textures to frame data
      const fromFrame = this._textureToFrame(fromTexture);
      const toFrame = this._textureToFrame(toTexture);

      // Validate dimensions match
      if (fromFrame.width !== toFrame.width || fromFrame.height !== toFrame.height) {
        throw new Error(
          `Frame dimensions mismatch: from=${fromFrame.width}x${fromFrame.height}, to=${toFrame.width}x${toFrame.height}`
        );
      }

      // Build transition params
      const transitionParams: TransitionParams = {
        transitionType: transitionType,
        progress: Math.max(0, Math.min(1, progress)),
        feather: options?.feather ?? 0.02,
        centerX: options?.centerX ?? 0.5,
        centerY: options?.centerY ?? 0.5,
        angle: options?.angle ?? 0,
      };

      // Apply transition
      const resultFrame = this._processor.applyTransition(fromFrame, toFrame, transitionParams);

      // Create output texture
      const outputTexture = this._frameToTexture(resultFrame);

      this._state = 'ready';

      return {
        texture: outputTexture,
        isNewTexture: true,
        processingTime: performance.now() - startTime,
      };
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Effect Support
  // ---------------------------------------------------------------------------

  /**
   * Check if an effect type is supported
   */
  isEffectSupported(effectType: string): boolean {
    return SUPPORTED_EFFECTS.includes(effectType as SupportedEffectType);
  }

  /**
   * Get list of supported effect types
   */
  getSupportedEffects(): string[] {
    return [...SUPPORTED_EFFECTS];
  }

  /**
   * Check if a transition type is supported
   */
  isTransitionSupported(transitionType: string): boolean {
    return SUPPORTED_TRANSITIONS.includes(transitionType as SupportedTransitionType);
  }

  /**
   * Get list of supported transition types
   */
  getSupportedTransitions(): string[] {
    return [...SUPPORTED_TRANSITIONS];
  }

  // ---------------------------------------------------------------------------
  // Cross-Process Texture Sharing (ICrossProcessEffectRunner)
  // ---------------------------------------------------------------------------

  /**
   * Import a texture from a cross-process handle
   */
  async importTexture(handle: TextureHandle): Promise<ITexture> {
    if (!this.isReady || !this._processor) {
      throw new Error('Effect runner not ready');
    }

    // Check if we already have this texture
    const existing = this._textureMap.get(handle.id);
    if (existing) {
      return existing;
    }

    // For now, we don't support true cross-process texture import
    // This would require platform-specific handle conversion (IOSurface, D3D11, DMA-BUF)
    // Instead, we create a placeholder texture that can be populated later

    const texture = new WgpuTexture(
      handle.id,
      handle.width,
      handle.height,
      handle.format,
      null // No data yet - would need to be populated via shared memory
    );

    this._textureMap.set(handle.id, texture);

    console.warn(
      '[WgpuEffectRunner] importTexture: Cross-process texture import not fully implemented. ' +
        'Texture created as placeholder.'
    );

    return texture;
  }

  /**
   * Export a texture to a cross-process handle
   */
  async exportTexture(texture: ITexture): Promise<TextureHandle> {
    if (!this.isReady || !this._processor) {
      throw new Error('Effect runner not ready');
    }

    // Get frame data from texture
    const frame = this._textureToFrame(texture);

    // Upload to GPU and get handle
    const nativeHandle = this._processor.uploadToTexture(frame);

    // Create cross-process handle
    const handle: TextureHandle = {
      id: `wgpu_${nativeHandle.id}_${nativeHandle.generation}`,
      width: nativeHandle.width,
      height: nativeHandle.height,
      format: nativeHandle.format === 'rgba8' ? 'rgba8' : 'bgra8',
      // Platform-specific handles would be populated here
      // For now, we use shared memory key if available
      platformHandle: nativeHandle.sharedMemoryKey
        ? {
            // Shared memory key can be used for cross-process sharing
            // Platform-specific handles (IOSurface, D3D11, DMA-BUF) would go here
          }
        : undefined,
    };

    console.log(`[WgpuEffectRunner] Exported texture: ${handle.id} (${handle.width}x${handle.height})`);

    return handle;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Convert ITexture to frame data for processing
   */
  private _textureToFrame(texture: ITexture): FrameData {
    // If it's a WgpuTexture with data, use it directly
    if (texture instanceof WgpuTexture && texture.data) {
      return {
        width: texture.width,
        height: texture.height,
        format: texture.format,
        data: texture.data,
        timestamp: 0,
        isKeyframe: true,
      };
    }

    // If native is a Uint8Array, use it
    if (texture.native instanceof Uint8Array) {
      return {
        width: texture.width,
        height: texture.height,
        format: 'rgba8',
        data: texture.native,
        timestamp: 0,
        isKeyframe: true,
      };
    }

    // If native is an ArrayBuffer, convert to Uint8Array
    if (texture.native instanceof ArrayBuffer) {
      return {
        width: texture.width,
        height: texture.height,
        format: 'rgba8',
        data: new Uint8Array(texture.native),
        timestamp: 0,
        isKeyframe: true,
      };
    }

    throw new Error(`Unsupported texture native type: ${typeof texture.native}`);
  }

  /**
   * Convert frame data to ITexture
   */
  private _frameToTexture(frame: FrameData): ITexture {
    const id = `wgpu_texture_${++this._textureIdCounter}`;
    const texture = new WgpuTexture(id, frame.width, frame.height, frame.format as 'rgba8' | 'bgra8', frame.data);

    this._textureMap.set(id, texture);

    return texture;
  }

  /**
   * Apply a single effect to frame data
   */
  private _applyEffect(frame: FrameData, effect: EffectInstance, _localTime: number): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    switch (effect.type) {
      case 'colorCorrection':
        return this._applyColorCorrection(frame, effect.params);
      case 'gaussianBlur':
        return this._applyBlur(frame, effect.params, 'gaussian');
      case 'boxBlur':
        return this._applyBlur(frame, effect.params, 'box');
      case 'motionBlur':
        return this._applyBlur(frame, effect.params, 'directional');
      case 'radialBlur':
        return this._applyBlur(frame, effect.params, 'radial');
      case 'zoomBlur':
        return this._applyBlur(frame, effect.params, 'zoom');
      case 'sharpen':
        return this._applySharpen(frame, effect.params);
      case 'vignette':
        return this._applyVignette(frame, effect.params);
      case 'filmGrain':
        return this._applyFilmGrain(frame, effect.params, _localTime);
      case 'glow':
        return this._applyGlow(frame, effect.params);
      case 'chromaticAberration':
        return this._applyChromaticAberration(frame, effect.params);
      default:
        // Unsupported effect, return unchanged
        console.warn(`[WgpuEffectRunner] Unsupported effect type: ${effect.type}`);
        return frame;
    }
  }

  /**
   * Apply color correction effect
   */
  private _applyColorCorrection(frame: FrameData, params: Record<string, unknown>): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    // Map effect parameters to media-processor-rs format
    // All parameters mapped to their N-API camelCase equivalents
    const effectParams: EffectParams = {
      // Basic adjustments
      brightness: typeof params.brightness === 'number' ? params.brightness : 0,
      contrast: typeof params.contrast === 'number' ? params.contrast : 1,
      saturation: typeof params.saturation === 'number' ? params.saturation : 1,
      exposure: typeof params.exposure === 'number' ? params.exposure : 0,

      // Tone adjustments
      gamma: typeof params.gamma === 'number' ? params.gamma : 1,
      hueShift: typeof params.hueShift === 'number' ? params.hueShift : 0,
      vibrance: typeof params.vibrance === 'number' ? params.vibrance : 0,

      // White balance
      temperature: typeof params.temperature === 'number' ? params.temperature : 0,
      tint: typeof params.tint === 'number' ? params.tint : 0,

      // Highlights/Shadows
      highlights: typeof params.highlights === 'number' ? params.highlights : 0,
      shadows: typeof params.shadows === 'number' ? params.shadows : 0,
      whites: typeof params.whites === 'number' ? params.whites : 0,
      blacks: typeof params.blacks === 'number' ? params.blacks : 0,
    };

    return this._processor.applyEffects(frame, effectParams);
  }

  /**
   * Apply blur effect
   */
  private _applyBlur(
    frame: FrameData,
    params: Record<string, unknown>,
    blurType: string
  ): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    const blurParams: BlurParams = {
      blurType: blurType,
      radius: typeof params.radius === 'number' ? params.radius : 5,
      directionX: typeof params.directionX === 'number' ? params.directionX : 1,
      directionY: typeof params.directionY === 'number' ? params.directionY : 0,
      centerX: typeof params.centerX === 'number' ? params.centerX : 0.5,
      centerY: typeof params.centerY === 'number' ? params.centerY : 0.5,
      strength: typeof params.strength === 'number' ? params.strength : 1,
      samples: typeof params.samples === 'number' ? params.samples : 16,
    };

    return this._processor.applyBlur(frame, blurParams);
  }

  /**
   * Apply sharpen effect
   */
  private _applySharpen(frame: FrameData, params: Record<string, unknown>): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    const sharpenParams: SharpenParams = {
      amount: typeof params.amount === 'number' ? params.amount : 1,
      radius: typeof params.radius === 'number' ? params.radius : 1,
      threshold: typeof params.threshold === 'number' ? params.threshold : 0,
    };

    return this._processor.applySharpen(frame, sharpenParams);
  }

  /**
   * Apply vignette effect
   */
  private _applyVignette(frame: FrameData, params: Record<string, unknown>): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    const vignetteParams: VignetteParams = {
      amount: typeof params.amount === 'number' ? params.amount : 0.5,
      radius: typeof params.radius === 'number' ? params.radius : 0.5,
      softness: typeof params.softness === 'number' ? params.softness : 0.5,
      roundness: typeof params.roundness === 'number' ? params.roundness : 1,
    };

    return this._processor.applyVignette(frame, vignetteParams);
  }

  /**
   * Apply film grain effect
   */
  private _applyFilmGrain(frame: FrameData, params: Record<string, unknown>, localTime: number): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    const filmGrainParams: FilmGrainParams = {
      amount: typeof params.amount === 'number' ? params.amount : 0.3,
      size: typeof params.size === 'number' ? params.size : 1,
      // Use localTime as seed for animated grain if time not specified
      time: typeof params.time === 'number' ? params.time : localTime,
      colorAmount: typeof params.colorAmount === 'number' ? params.colorAmount : 0,
    };

    return this._processor.applyFilmGrain(frame, filmGrainParams);
  }

  /**
   * Apply glow/bloom effect
   */
  private _applyGlow(frame: FrameData, params: Record<string, unknown>): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    const glowParams: GlowParams = {
      intensity: typeof params.intensity === 'number' ? params.intensity : 1,
      threshold: typeof params.threshold === 'number' ? params.threshold : 0.7,
      radius: typeof params.radius === 'number' ? params.radius : 10,
    };

    return this._processor.applyGlow(frame, glowParams);
  }

  /**
   * Apply chromatic aberration effect
   */
  private _applyChromaticAberration(frame: FrameData, params: Record<string, unknown>): FrameData {
    if (!this._processor) {
      throw new Error('Processor not initialized');
    }

    const chromaticParams: ChromaticAberrationParams = {
      amount: typeof params.amount === 'number' ? params.amount : 0.01,
      angle: typeof params.angle === 'number' ? params.angle : 0,
      centerX: typeof params.centerX === 'number' ? params.centerX : 0.5,
      centerY: typeof params.centerY === 'number' ? params.centerY : 0.5,
    };

    return this._processor.applyChromaticAberration(frame, chromaticParams);
  }
}

// =============================================================================
// WgpuTexture Implementation
// =============================================================================

/**
 * Texture wrapper for wgpu backend
 */
class WgpuTexture implements ITexture {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'rgba8' | 'bgra8';
  readonly data: Uint8Array | null;

  constructor(id: string, width: number, height: number, format: 'rgba8' | 'bgra8', data: Uint8Array | null) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.format = format;
    this.data = data;
  }

  /**
   * Native texture object
   * For wgpu backend, this is the raw pixel data buffer
   */
  get native(): unknown {
    return this.data;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new WgpuEffectRunner instance
 */
export function createWgpuEffectRunner(): WgpuEffectRunner {
  return new WgpuEffectRunner();
}

/**
 * Check if wgpu backend is available
 * This checks if we're in a Node.js environment and the native module can be loaded
 */
export function isWgpuSupported(): boolean {
  // Check if we're in Node.js environment by checking for global process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalProcess = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>).process : undefined;
  if (
    !globalProcess ||
    typeof (globalProcess as Record<string, unknown>).versions === 'undefined' ||
    typeof ((globalProcess as Record<string, unknown>).versions as Record<string, unknown>)?.node === 'undefined'
  ) {
    return false;
  }

  // Try to check if the native module exists
  // We don't actually load it here to avoid side effects
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalRequire = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>).require : undefined;
    if (globalRequire && typeof globalRequire === 'function') {
      const requireFn = globalRequire as { resolve?: (id: string) => string };
      if (requireFn.resolve) {
        requireFn.resolve('@neko-engine/native-napi');
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
