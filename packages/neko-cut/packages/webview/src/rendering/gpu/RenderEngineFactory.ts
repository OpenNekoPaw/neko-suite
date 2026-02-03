/**
 * RenderEngineFactory - 渲染引擎工厂
 * Render Engine Factory for automatic backend selection
 *
 * 功能:
 * - 自动检测 GPU 支持
 * - 创建 GPURenderEngine 或 Canvas2DRenderEngine
 * - 支持强制指定后端
 */

import type { WebviewMediaFrameProviderConfig } from '../unified/mediaFrameProvider';
import type { Canvas2DCompositorOptions } from '../canvas2d/types';
import { Canvas2DRenderEngine } from '../canvas2d/Canvas2DRenderEngine';
import { GPURenderEngine, type GPURenderEngineOptions, type FrameProviderOptions } from './GPURenderEngine';
import { isWebGPUSupported, isWebGL2Supported } from './CompositorFactory';

// =============================================================================
// Types
// =============================================================================

/**
 * Render engine backend type
 */
export type RenderEngineBackend = 'gpu' | 'canvas2d' | 'auto';

/**
 * Render engine type (returned from factory)
 */
export type RenderEngineType = 'webgpu' | 'webgl' | 'canvas2d';

/**
 * Render engine interface (common methods)
 */
export interface IRenderEngine {
  // Lifecycle
  initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: RenderEngineOptions
  ): Promise<boolean>;
  dispose(): void;
  resize(width: number, height: number): void;

  // State
  readonly isInitialized: boolean;
  readonly width: number;
  readonly height: number;

  // Rendering
  renderProjectFrame(
    project: unknown,
    time: number,
    mode?: 'preview' | 'export',
    quality?: 'preview' | 'final'
  ): Promise<void>;

  // Export
  toImageData(): ImageData;
  toBlob(type?: string, quality?: number): Promise<Blob>;
  toImageBitmap(): Promise<ImageBitmap>;
}

/**
 * Render engine factory options
 */
export interface RenderEngineFactoryOptions {
  /** Preferred backend ('gpu' | 'canvas2d' | 'auto') */
  preferredBackend?: RenderEngineBackend;
  /** Allow fallback to Canvas 2D if GPU fails */
  allowFallback?: boolean;
  /** GPU-specific options */
  gpu?: Omit<GPURenderEngineOptions, 'frameProviderOptions'>;
  /** Canvas 2D-specific options */
  canvas2d?: Canvas2DCompositorOptions;
  /** Frame provider options (for Zero-Copy Webview decoding) */
  frameProviderOptions?: FrameProviderOptions;
}

/**
 * Render engine options (passed to initialize)
 */
export type RenderEngineOptions = GPURenderEngineOptions | (Canvas2DCompositorOptions & { frameProvider?: WebviewMediaFrameProviderConfig });

/**
 * Create result
 */
export interface CreateRenderEngineResult {
  engine: GPURenderEngine | Canvas2DRenderEngine;
  type: RenderEngineType;
}

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_FACTORY_OPTIONS: RenderEngineFactoryOptions = {
  preferredBackend: 'auto',
  allowFallback: true,
  gpu: {
    preferredBackend: 'auto',
    allowFallback: true,
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  },
  canvas2d: {
    alpha: true,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    willReadFrequently: false,
    backgroundColor: null,
  },
  frameProviderOptions: undefined,
};

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Check if GPU rendering is available
 */
export async function isGPURenderingAvailable(): Promise<boolean> {
  // Check WebGPU first
  if (await isWebGPUSupported()) {
    return true;
  }

  // Fall back to WebGL 2.0
  if (isWebGL2Supported()) {
    return true;
  }

  return false;
}

/**
 * Get the best available render engine type
 */
export async function getBestAvailableEngine(): Promise<RenderEngineType> {
  if (await isWebGPUSupported()) {
    return 'webgpu';
  }
  if (isWebGL2Supported()) {
    return 'webgl';
  }
  return 'canvas2d';
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a render engine with automatic backend selection
 *
 * @param canvas Target canvas
 * @param options Factory options
 * @returns Render engine and its type
 *
 * @example
 * ```typescript
 * // Auto-select best backend
 * const { engine, type } = await createRenderEngine(canvas);
 * console.log(`Using ${type} backend`);
 *
 * // Force GPU backend
 * const { engine } = await createRenderEngine(canvas, {
 *   preferredBackend: 'gpu',
 *   allowFallback: false,
 * });
 *
 * // Force Canvas 2D backend
 * const { engine } = await createRenderEngine(canvas, {
 *   preferredBackend: 'canvas2d',
 * });
 * ```
 */
export async function createRenderEngine(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options?: RenderEngineFactoryOptions
): Promise<CreateRenderEngineResult> {
  const opts = { ...DEFAULT_FACTORY_OPTIONS, ...options };

  // Determine which backends to try
  const backendsToTry: RenderEngineBackend[] = [];
  const preferredBackend = opts.preferredBackend ?? 'auto';

  if (preferredBackend === 'auto') {
    // Auto mode: try GPU first, then Canvas 2D
    backendsToTry.push('gpu', 'canvas2d');
  } else {
    // Specific backend requested
    backendsToTry.push(preferredBackend);
    if (opts.allowFallback && preferredBackend !== 'canvas2d') {
      backendsToTry.push('canvas2d');
    }
  }

  const errors: Error[] = [];

  for (const backend of backendsToTry) {
    try {
      if (backend === 'gpu') {
        // Check GPU availability
        if (!(await isGPURenderingAvailable())) {
          throw new Error('No GPU backend available');
        }

        // Try GPU engine
        const gpuEngine = new GPURenderEngine();
        const gpuOptions: GPURenderEngineOptions = {
          ...opts.gpu,
          frameProviderOptions: opts.frameProviderOptions,
        };

        const success = await gpuEngine.initialize(canvas, gpuOptions);
        if (success) {
          const type = gpuEngine.backend === 'webgpu' ? 'webgpu' : 'webgl';
          return { engine: gpuEngine, type };
        } else {
          throw new Error('GPU engine initialization failed');
        }
      } else if (backend === 'canvas2d') {
        // Try Canvas 2D engine
        const canvas2dEngine = new Canvas2DRenderEngine();
        const canvas2dOptions = {
          ...opts.canvas2d,
          frameProvider: opts.frameProviderOptions?.webviewConfig,
        };

        const success = await canvas2dEngine.initialize(canvas, canvas2dOptions);
        if (success) {
          return { engine: canvas2dEngine, type: 'canvas2d' };
        } else {
          throw new Error('Canvas 2D engine initialization failed');
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));

      if (!opts.allowFallback) {
        break;
      }
    }
  }

  // All backends failed
  const errorMessages = errors.map(e => e.message).join('; ');
  throw new Error(`Failed to create render engine: ${errorMessages}`);
}

/**
 * Create GPU render engine (convenience function)
 */
export async function createGPURenderEngine(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options?: Omit<RenderEngineFactoryOptions, 'preferredBackend'>
): Promise<CreateRenderEngineResult> {
  return createRenderEngine(canvas, {
    ...options,
    preferredBackend: 'gpu',
  });
}

/**
 * Create Canvas 2D render engine (convenience function)
 */
export async function createCanvas2DRenderEngine(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options?: Omit<RenderEngineFactoryOptions, 'preferredBackend'>
): Promise<CreateRenderEngineResult> {
  return createRenderEngine(canvas, {
    ...options,
    preferredBackend: 'canvas2d',
  });
}

// =============================================================================
// Singleton Management
// =============================================================================

let _defaultEngine: GPURenderEngine | Canvas2DRenderEngine | null = null;
let _defaultEngineType: RenderEngineType | null = null;

/**
 * Get or create the default render engine instance
 *
 * @param canvas Target canvas (required for first call)
 * @param options Factory options (only used on first call)
 * @returns Render engine and its type
 */
export async function getDefaultRenderEngine(
  canvas?: HTMLCanvasElement | OffscreenCanvas,
  options?: RenderEngineFactoryOptions
): Promise<CreateRenderEngineResult> {
  if (!_defaultEngine) {
    if (!canvas) {
      throw new Error('Canvas required for first initialization');
    }
    const result = await createRenderEngine(canvas, options);
    _defaultEngine = result.engine;
    _defaultEngineType = result.type;
  }

  return {
    engine: _defaultEngine,
    type: _defaultEngineType!,
  };
}

/**
 * Dispose the default render engine instance
 */
export function disposeDefaultRenderEngine(): void {
  if (_defaultEngine) {
    _defaultEngine.dispose();
    _defaultEngine = null;
    _defaultEngineType = null;
  }
}
