/**
 * Effects Runtime
 *
 * GPU effect runtime for video editing.
 * Provides zero-copy texture processing with WebGPU/WebGL backends.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Effect types
  EffectCategory,
  EffectType,
  EffectParams,
  EffectInstance,
  // Texture types
  ITexture,
  TextureSource,
  RawTextureSource,
  // Runner types
  EffectRunnerState,
  EffectRunnerBackend,
  EffectRunnerGpuInfo,
  EffectRunResult,
  // Interfaces
  IEffectContext,
  IEffectRunner,
  ICrossProcessEffectRunner,
  TextureHandle,
  // Factory types
  EffectRunnerOptions,
  EffectRunnerFactory,
} from './types';

// =============================================================================
// Runners
// =============================================================================

export {
  WebGPUEffectRunner,
  createWebGPUEffectRunner,
  isWebGPUSupported,
  WgpuEffectRunner,
  createWgpuEffectRunner,
  isWgpuSupported,
} from './runners';

// =============================================================================
// Adapters
// =============================================================================

export {
  EffectProcessorAdapter,
  createEffectProcessorAdapter,
} from './adapters';

// =============================================================================
// Compositor
// =============================================================================

export type {
  BlendMode,
  Transform2D,
  Size,
  CompositeLayer,
  CompositorState,
  CompositeResult,
  ICompositor,
} from './compositor';

export {
  createDefaultTransform,
  createCompositeLayer,
  BLEND_MODE_VALUES,
  WgpuCompositor,
  createWgpuCompositor,
  isWgpuCompositorSupported,
} from './compositor';

// =============================================================================
// Factory
// =============================================================================

import type { IEffectRunner, ICrossProcessEffectRunner, EffectRunnerOptions } from './types';
import { WebGPUEffectRunner, isWebGPUSupported, WgpuEffectRunner, isWgpuSupported } from './runners';

/**
 * Create an effect runner with automatic backend selection
 *
 * @param options - Runner options
 * @returns Effect runner instance
 *
 * @example
 * ```typescript
 * // In Webview (browser environment)
 * const runner = createEffectRunner();
 * await runner.initialize(context);
 *
 * // In Extension Host (Node.js environment)
 * const runner = createEffectRunner({ preferredBackend: 'wgpu' });
 * await runner.initialize();
 *
 * const result = await runner.run(inputTexture, effects, localTime);
 * ```
 */
export function createEffectRunner(options?: EffectRunnerOptions): IEffectRunner {
  const preferredBackend = options?.preferredBackend ?? 'webgpu';
  const allowFallback = options?.allowFallback ?? true;

  // Try wgpu backend (Node.js / Extension Host)
  if (preferredBackend === 'wgpu') {
    if (isWgpuSupported()) {
      return new WgpuEffectRunner();
    }
    if (!allowFallback) {
      throw new Error('wgpu backend not available');
    }
  }

  // Try WebGPU backend (browser / Webview)
  if (preferredBackend === 'webgpu' || allowFallback) {
    if (isWebGPUSupported()) {
      return new WebGPUEffectRunner();
    }
  }

  // Try wgpu as fallback for WebGPU
  if (allowFallback && isWgpuSupported()) {
    return new WgpuEffectRunner();
  }

  // TODO: Add WebGL fallback when implemented
  // if (preferredBackend === 'webgl' || allowFallback) {
  //   return new WebGLEffectRunner();
  // }

  throw new Error('No supported GPU backend available');
}

/**
 * Create a cross-process effect runner
 *
 * This creates a runner that supports cross-process texture sharing,
 * currently only available with the wgpu backend.
 *
 * @returns Cross-process effect runner instance
 * @throws Error if wgpu backend is not available
 *
 * @example
 * ```typescript
 * const runner = createCrossProcessEffectRunner();
 * await runner.initialize();
 *
 * // Export texture for cross-process sharing
 * const handle = await runner.exportTexture(texture);
 *
 * // Import texture from another process
 * const imported = await runner.importTexture(handle);
 * ```
 */
export function createCrossProcessEffectRunner(): ICrossProcessEffectRunner {
  if (!isWgpuSupported()) {
    throw new Error('Cross-process effect runner requires wgpu backend');
  }
  return new WgpuEffectRunner();
}
