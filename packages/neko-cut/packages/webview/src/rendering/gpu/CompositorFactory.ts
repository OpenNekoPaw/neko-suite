/**
 * CompositorFactory - 合成器工厂
 * Compositor Factory for automatic backend selection
 *
 * 功能:
 * - 自动检测 WebGPU/WebGL 支持
 * - 按优先级创建合成器
 * - 支持强制指定后端
 */

import type {
  ICompositor,
  CompositorBackend,
  CompositorOptions,
} from './ICompositor';

// =============================================================================
// Backend Detection
// =============================================================================

/**
 * 检测是否在 VSCode webview 环境中
 */
export function isVSCodeWebview(): boolean {
  return !!(window as unknown as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
}

/**
 * WebGPU 检测结果
 */
export interface WebGPUDetectionResult {
  supported: boolean;
  reason: string;
  adapter?: GPUAdapter;
  device?: GPUDevice;
  timing?: {
    total: number;
    adapter: number;
    device: number;
  };
}

/**
 * 详细的 WebGPU 检测（用于诊断）
 * 返回详细的检测结果，不会超时
 */
export async function testWebGPUSupport(): Promise<WebGPUDetectionResult> {
  const startTime = performance.now();

  // Check navigator.gpu
  if (!('gpu' in navigator)) {
    return {
      supported: false,
      reason: 'navigator.gpu not available',
    };
  }

  try {
    const adapterStart = performance.now();
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    const adapterTime = performance.now() - adapterStart;

    if (!adapter) {
      return {
        supported: false,
        reason: 'No adapter available',
        timing: {
          total: performance.now() - startTime,
          adapter: adapterTime,
          device: 0,
        },
      };
    }

    const deviceStart = performance.now();
    const device = await adapter.requestDevice();
    const deviceTime = performance.now() - deviceStart;

    if (!device) {
      return {
        supported: false,
        reason: 'No device available',
        timing: {
          total: performance.now() - startTime,
          adapter: adapterTime,
          device: deviceTime,
        },
      };
    }

    const totalTime = performance.now() - startTime;

    return {
      supported: true,
      reason: 'WebGPU fully supported',
      adapter,
      device,
      timing: {
        total: totalTime,
        adapter: adapterTime,
        device: deviceTime,
      },
    };
  } catch (err) {
    return {
      supported: false,
      reason: `Error: ${err instanceof Error ? err.message : String(err)}`,
      timing: {
        total: performance.now() - startTime,
        adapter: 0,
        device: 0,
      },
    };
  }
}

/**
 * 检测 WebGPU 是否支持
 */
export async function isWebGPUSupported(): Promise<boolean> {
  // Quick check: navigator.gpu must exist
  if (!('gpu' in navigator)) {
    return false;
  }

  // Longer timeout (30s) since requestAdapter can take time
  const timeout = 30000;
  const timeoutPromise = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, timeout);
  });

  const detectionPromise = (async () => {
    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        return false;
      }

      const device = await adapter.requestDevice();

      if (!device) {
        return false;
      }

      device.destroy();
      return true;
    } catch (_err) {
      return false;
    }
  })();

  return Promise.race([detectionPromise, timeoutPromise]);
}

/**
 * 检测 WebGL 2.0 是否支持
 */
export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch (_err) {
    return false;
  }
}

/**
 * 获取可用的后端列表 (按优先级排序)
 */
export async function getAvailableBackends(): Promise<CompositorBackend[]> {
  const backends: CompositorBackend[] = [];

  // WebGPU 优先
  if (await isWebGPUSupported()) {
    backends.push('webgpu');
  }

  // WebGL 2.0 作为降级
  if (isWebGL2Supported()) {
    backends.push('webgl');
  }

  return backends;
}

// =============================================================================
// Factory Options
// =============================================================================

/**
 * 工厂选项
 */
export interface CompositorFactoryOptions extends CompositorOptions {
  /** 首选后端 ('webgpu' | 'webgl' | 'auto') */
  preferredBackend?: CompositorBackend | 'auto';
  /** 是否允许降级到其他后端 */
  allowFallback?: boolean;
}

/**
 * 默认工厂选项
 */
const DEFAULT_FACTORY_OPTIONS: Required<CompositorFactoryOptions> = {
  preferredBackend: 'auto',
  allowFallback: true,
  antialias: false,
  alpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

// =============================================================================
// Compositor Factory
// =============================================================================

// 延迟导入后端实现，避免循环依赖
let WebGLCompositorClass: (new () => ICompositor) | null = null;
let WebGPUCompositorClass: (new () => ICompositor) | null = null;

/**
 * 加载 WebGL 合成器
 */
async function loadWebGLCompositor(): Promise<new () => ICompositor> {
  if (!WebGLCompositorClass) {
    const module = await import('./webgl/WebGLCompositor');
    WebGLCompositorClass = module.WebGLCompositor;
  }
  return WebGLCompositorClass;
}

/**
 * 加载 WebGPU 合成器
 */
async function loadWebGPUCompositor(): Promise<new () => ICompositor> {
  if (!WebGPUCompositorClass) {
    const module = await import('./webgpu/WebGPUCompositor');
    WebGPUCompositorClass = module.WebGPUCompositor;
  }
  return WebGPUCompositorClass;
}

/**
 * 创建合成器
 *
 * 根据选项和设备支持情况自动选择最佳后端
 *
 * @param canvas 目标画布
 * @param options 工厂选项
 * @returns 合成器实例
 * @throws 如果没有可用后端
 *
 * @example
 * ```typescript
 * // 自动选择最佳后端
 * const compositor = await createCompositor(canvas);
 *
 * // 强制使用 WebGL
 * const compositor = await createCompositor(canvas, {
 *   preferredBackend: 'webgl',
 *   allowFallback: false,
 * });
 * ```
 */
export async function createCompositor(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options?: CompositorFactoryOptions
): Promise<ICompositor> {
  const opts = { ...DEFAULT_FACTORY_OPTIONS, ...options };

  // 确定要尝试的后端列表
  let backendsToTry: CompositorBackend[];

  if (opts.preferredBackend === 'auto') {
    // 自动模式：按优先级尝试所有可用后端
    backendsToTry = await getAvailableBackends();
  } else {
    // 指定后端
    backendsToTry = [opts.preferredBackend];
    if (opts.allowFallback) {
      // 添加降级后端
      const allBackends = await getAvailableBackends();
      for (const backend of allBackends) {
        if (!backendsToTry.includes(backend)) {
          backendsToTry.push(backend);
        }
      }
    }
  }

  if (backendsToTry.length === 0) {
    throw new Error('No GPU backend available');
  }

  // 尝试创建合成器
  const errors: Error[] = [];

  for (const backend of backendsToTry) {
    try {
      const compositor = await createBackendCompositor(backend);

      // 尝试初始化
      const success = await compositor.initialize(canvas, {
        antialias: opts.antialias,
        alpha: opts.alpha,
        preserveDrawingBuffer: opts.preserveDrawingBuffer,
        powerPreference: opts.powerPreference,
      });

      if (success) {
        return compositor;
      } else {
        throw new Error(`Failed to initialize ${backend} compositor`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));

      if (!opts.allowFallback) {
        break;
      }
    }
  }

  // 所有后端都失败了
  const errorMessages = errors.map(e => e.message).join('; ');
  throw new Error(`Failed to create compositor: ${errorMessages}`);
}

/**
 * 根据后端类型创建合成器实例
 */
async function createBackendCompositor(backend: CompositorBackend): Promise<ICompositor> {
  switch (backend) {
    case 'webgpu': {
      const CompositorClass = await loadWebGPUCompositor();
      return new CompositorClass();
    }
    case 'webgl': {
      const CompositorClass = await loadWebGLCompositor();
      return new CompositorClass();
    }
    default:
      throw new Error(`Unknown backend: ${backend}`);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _defaultCompositor: ICompositor | null = null;

/**
 * 获取或创建默认合成器实例
 *
 * @param canvas 目标画布 (首次调用时必需)
 * @param options 工厂选项 (首次调用时可选)
 * @returns 合成器实例
 */
export async function getDefaultCompositor(
  canvas?: HTMLCanvasElement | OffscreenCanvas,
  options?: CompositorFactoryOptions
): Promise<ICompositor> {
  if (!_defaultCompositor) {
    if (!canvas) {
      throw new Error('Canvas required for first initialization');
    }
    _defaultCompositor = await createCompositor(canvas, options);
  }
  return _defaultCompositor;
}

/**
 * 销毁默认合成器实例
 */
export function disposeDefaultCompositor(): void {
  if (_defaultCompositor) {
    _defaultCompositor.dispose();
    _defaultCompositor = null;
  }
}
